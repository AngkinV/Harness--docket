import { UIIcon, useTransientNotice } from './ui'
import { menuDefaults } from './attached-menu-layout.js'
import type { MenuPreferences } from './attached-menu'
import React, { useEffect, useRef, useState } from 'react'
export type Binding = { id: string; clip: number } | null
export type Interaction = { id: string; name: string; enabled: boolean; action: string; motion: Binding; expression: string; intensity: number; sticker: string; size: number; duration: number; text: string }
export type Profile = { gaze?: 'off' | 'gentle' | 'noticeable'; attachedMenu?: MenuPreferences; dailyEnabled?: boolean; daily?: { id: string; weight: number; cooldown: number }[]; events?: Record<string, string>; roaming: boolean; speed: number; walk: Binding; idle: Binding; mode: string; fixed: string; interactions: Interaction[] }
export type Asset = { id: string; name: string; kind: string; bytes: number; source?: string }
export type CompanionData = { assets: Asset[]; profiles: Record<string, Profile>; revisions?: Record<string, number>; defaults?: { walk: Binding }; errors?: { name: string; error: string }[] }
export const assetURL = (id: string) => '/harness-docket/companion/asset?id=' + encodeURIComponent(id)
export const defaultProfile = (data?: CompanionData): Profile => ({ roaming: true, speed: 32, walk: data?.defaults?.walk || null, idle: null, mode: 'random', fixed: 'hello', interactions: [
  { id: 'hello', name: '见到你很开心', enabled: true, action: 'wave', motion: null, expression: 'happy', intensity: .7, sticker: 'heart', size: 32, duration: 3, text: '' },
  { id: 'curious', name: '有什么新鲜事', enabled: true, action: 'head', motion: null, expression: 'surprised', intensity: .5, sticker: 'question', size: 60, duration: 3, text: '' },
  { id: 'music', name: '轻松一下', enabled: true, action: 'wave', motion: null, expression: 'relaxed', intensity: .7, sticker: 'music', size: 64, duration: 3.5, text: '' },
] })
export function Sticker({ interaction }: { interaction: Interaction }) {
  const symbols: Record<string, string> = { heart: '♡', question: '?', music: '♫' }
  return <div className="hda-reaction" style={{ '--reaction-size': interaction.size + 'px', '--reaction-duration': interaction.duration + 's' } as any}>
    {interaction.sticker !== 'none' && (symbols[interaction.sticker] ? <span className={'hda-symbol hda-symbol-' + interaction.sticker}>{symbols[interaction.sticker]}</span> : <img src={assetURL(interaction.sticker)} alt="" onError={e => { e.currentTarget.style.display = 'none' }}/>) }
    {interaction.text && <span className="hda-reaction-text">{interaction.text}</span>}
  </div>
}
const errors = (e: any) => e?.message || '操作失败，请重试'
export function CompanionControls({ tab, id, data, initial, reload, request, renderer, capabilities, onPreview, motionStatus, onEditState, onMenuDraft }: {
  onMenuDraft?: (value: MenuPreferences) => void; tab: string; id: string; data: CompanionData; initial: Profile; reload: () => Promise<void>; request: (path: string, data?: object) => Promise<any>; renderer: () => Promise<any>; capabilities: { expressions: string[]; motion: boolean; alpha?: boolean; gaze?: string }; onPreview: (action: string, motion: Binding, interaction?: Interaction) => void; motionStatus: string; onEditState: (dirty: boolean, busy: boolean) => void
}) {
  const [profile, setProfile] = useState<Profile>(() => structuredClone(initial)), [selected, setSelected] = useState(initial.interactions[0].id)
  const [assetId, setAssetId] = useState(''), [clips, setClips] = useState<any[]>([]), [clip, setClip] = useState(0), [name, setName] = useState('')
  const [busy, setBusy] = useState(false), [notice, setNotice] = useState(''), [error, setError] = useState(''), [progress, setProgress] = useState<number | null>(null), [removeId, setRemoveId] = useState('')
  const [interactionClips, setInteractionClips] = useState<any[]>([])
  const [dirty, setDirty] = useState(false), [previewed, setPreviewed] = useState('')
  const xhr = useRef<XMLHttpRequest | null>(null), alive = useRef(true), lock = useRef(false), loadToken = useRef(0)
  const uploadInput = useRef<HTMLInputElement>(null), stickerInput = useRef<HTMLInputElement>(null), greetingInput = useRef<HTMLInputElement>(null)
  useEffect(() => () => { alive.current = false; xhr.current?.abort(); loadToken.current++ }, [])
  useTransientNotice(notice, () => setNotice(''), dirty)
  const revision = useRef(data.revisions?.[id] || 0)
  const [conflict, setConflict] = useState(false)
  const initialValue = JSON.stringify(initial)
  useEffect(() => { if (!dirty) { setProfile(JSON.parse(initialValue)); revision.current = data.revisions?.[id] || 0 } }, [initialValue, data.revisions?.[id]])
  useEffect(() => { onMenuDraft?.(profile.attachedMenu || menuDefaults()) }, [profile.attachedMenu])
  const menu = profile.attachedMenu || menuDefaults()
  const editMenu = (patch: Partial<MenuPreferences>) => edit({ ...profile, attachedMenu: { ...menu, ...patch } })
  const edit = (next: Profile) => { setProfile(next); setDirty(true); setNotice('') }
  const interaction = profile.interactions.find(i => i.id === selected) || profile.interactions[0]
  useEffect(() => { onEditState(dirty, busy) }, [dirty, busy])
  useEffect(() => {
    let active = true; setInteractionClips([])
    if (interaction.motion) renderer().then(m => m.motionAsset(interaction.motion!.id)).then(data => { if (active) setInteractionClips(data.clips.map((c: any, index: number) => ({ index, name: c.name, duration: c.duration }))) }).catch(e => { if (active) setError(errors(e)) })
    return () => { active = false }
  }, [interaction.motion?.id])
  const editInteraction = (patch: Partial<Interaction>) => edit({ ...profile, interactions: profile.interactions.map(i => i.id === interaction.id ? { ...i, ...patch } : i) })
  const perform = async (fn: () => Promise<void>) => {
    if (lock.current) return; lock.current = true; setBusy(true); setError(''); setNotice('')
    try { await fn() } catch (e) { if (alive.current) setError(errors(e)) } finally { lock.current = false; if (alive.current) { setBusy(false); setProgress(null) } }
  }
  const selectMotion = async (next: string) => {
    const token = ++loadToken.current; setAssetId(next); setClips([]); setClip(0); setPreviewed(''); setName(data.assets.find(a => a.id === next)?.name || '')
    if (!next) return
    try { const module = await renderer(), parsed = await module.motionAsset(next); if (!alive.current || token !== loadToken.current) return; setClips(parsed.clips.map((c: any, index: number) => ({ index, name: c.name, duration: c.duration }))); setError('') } catch (e) { if (alive.current && token === loadToken.current) setError(errors(e)) }
  }
  const upload = (file: File, kind: string) => perform(async () => {
    if (!file.size || file.size > (kind === 'motion' ? 50 : 5) * 1024 ** 2) throw new Error(kind === 'motion' ? 'FBX 应在 50 MB 以内' : '贴纸应在 5 MB 以内')
    setNotice('正在检查文件…')
    if (kind === 'motion') { if (!/\.fbx$/i.test(file.name)) throw new Error('请选择 FBX 文件'); await (await renderer()).inspectMotion(await file.arrayBuffer()) }
    else {
      if (!/\.(png|webp|gif)$/i.test(file.name)) throw new Error('请选择 PNG、WebP 或 GIF')
      const url = URL.createObjectURL(file)
      try { await new Promise<void>((resolve, reject) => { const image = new Image(); image.onload = () => image.width <= 2048 && image.height <= 2048 ? resolve() : reject(new Error('贴纸尺寸不能超过 2048 × 2048')); image.onerror = () => reject(new Error('图片无法解码')); image.src = url }) } finally { URL.revokeObjectURL(url) }
    }
    if (!alive.current) return
    setProgress(0); setNotice('')
    const result: any = await new Promise((resolve, reject) => {
      const req = new XMLHttpRequest(); xhr.current = req; req.open('POST', '/harness-docket/companion/upload?filename=' + encodeURIComponent(file.name)); req.timeout = 120000
      req.upload.onprogress = e => { if (e.lengthComputable && alive.current) setProgress(Math.round(e.loaded / e.total * 100)) }
      req.onload = () => { try { const result = JSON.parse(req.responseText); if (!result.ok) throw new Error(result.error || '上传失败'); resolve(result) } catch (e) { reject(e) } }
      req.onerror = () => reject(new Error('连接中断，请重试')); req.onabort = () => reject(new Error('已取消上传')); req.ontimeout = () => reject(new Error('上传超时')); req.send(file)
    })
    await reload(); if (!alive.current) return
    if (kind === 'motion') { await selectMotion(result.item.id); setName(result.item.name) } else editInteraction({ sticker: result.item.id })
    setNotice(kind === 'motion' ? '上传完成。请选择片段并预览，再绑定到角色。' : '贴纸已加入当前互动，保存后生效。')
  })
  const binding = assetId ? { id: assetId, clip } : null
  const preview = () => { setError(''); onPreview('walk', binding); setPreviewed(assetId + ':' + clip) }
  const bind = (slot: 'walk' | 'idle') => { edit({ ...profile, [slot]: binding }); setNotice('已选择，保存设置后生效。') }
  const bindInteraction = () => {
    const next = { ...defaultProfile().interactions[0], id: crypto.randomUUID(), name: name.slice(0, 40), action: 'idle', motion: binding, expression: '', sticker: 'music', text: '', duration: Math.max(2, Math.min(600, Math.ceil(clips[clip].duration * 2) / 2)) }
    edit({ ...profile, interactions: [...profile.interactions, next] }); setSelected(next.id); setNotice('已加入点击互动，按完整片段设置时长。保存设置后生效。')
  }
  const copyInteraction = () => {
    const next = { ...structuredClone(interaction), id: crypto.randomUUID(), name: (interaction.name + ' 副本').slice(0, 40) }
    edit({ ...profile, interactions: [...profile.interactions, next] }); setSelected(next.id)
  }
  const importGreetings = (file: File) => perform(async () => {
    if (file.size > 64 * 1024) throw new Error('招呼语文件应在 64 KB 以内')
    const raw = (await file.text()).replace(/^\uFEFF/, '')
    const lines = /\.json$/i.test(file.name) ? JSON.parse(raw) : raw.split(/\r?\n/).filter(line => line.trim())
    if (!Array.isArray(lines) || !lines.length || lines.some(line => typeof line !== 'string' || !line.trim() || line.length > 80)) throw new Error('请使用每行一句的 TXT 或字符串数组 JSON，每句 1–80 字')
    if (profile.interactions.length + lines.length > 12) throw new Error('最多保存 12 个组合，请减少导入数量或删除不用的组合；现有内容未改变')
    const added = lines.map(text => ({ ...structuredClone(interaction), id: crypto.randomUUID(), name: text.slice(0, 40), text }))
    edit({ ...profile, interactions: [...profile.interactions, ...added] }); setSelected(added[0].id)
    setNotice('招呼语已追加为独立组合，沿用当前动作和表情，可分别修改。保存后生效。')
  })
  const assetName = (b: Binding) => b ? (data.assets.find(a => a.id === b.id)?.name || '资源已删除') + ' · 片段 ' + (b.clip + 1) : '内置动作'
  const canBind = !!binding && capabilities.motion && clips.length > 0 && previewed === assetId + ':' + clip && motionStatus === 'ready'
  const label: Record<string, string> = { happy: '开心', angry: '生气', sad: '难过', relaxed: '放松', surprised: '惊讶', neutral: '自然', aa: '张嘴 · A', ih: '口型 · I', ou: '口型 · U', ee: '口型 · E', oh: '口型 · O' }
  const save = () => perform(async () => {
    if (motionStatus === 'loading') throw new Error('请等待动作预览完成')
    if (!['ready', ''].includes(motionStatus)) throw new Error('请先修正动作预览中的问题')
    for (const binding of [profile.walk, profile.idle, ...profile.interactions.map(i => i.motion)]) {
      if (!binding) continue
      if (!capabilities.motion) throw new Error('当前模型无法使用外部动作，请恢复内置动作')
      const parsed = await (await renderer()).motionAsset(binding.id)
      if (!parsed.clips[binding.clip]) throw new Error('所选动作片段不存在，请重新选择')
    }
    try {
      const result = await request('companion/settings', { id, profile: { ...profile, mode: 'random' }, revision: revision.current })
      revision.current = result.revision; setDirty(false); setConflict(false); await reload(); setNotice('已保存，回到页面即可体验。')
    } catch (e: any) { if (e.status === 409) { setConflict(true); await reload() }; throw e }
  })
  return <form id="hda-companion-settings" onSubmit={e => { e.preventDefault(); void save() }} className="hda-controls" aria-label={tab === 'model' ? '贴身菜单设置' : tab === 'motion' ? '动作库' : '互动设置'}>
    {conflict && <div role="alert" className="hda-error"><p>设置已更新，当前草稿已保留。可导出草稿用于比较，再载入最新设置。</p><button type="button" className="hda-secondary" onClick={() => { const url = URL.createObjectURL(new Blob([JSON.stringify(profile, null, 2)], { type: 'application/json' })); const link = document.createElement('a'); link.href = url; link.download = 'companion-draft.json'; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000) }}>导出当前草稿</button><button type="button" className="hda-danger" onClick={() => { setProfile(structuredClone(initial)); revision.current = data.revisions?.[id] || 0; setDirty(false); setConflict(false); setError('') }}>放弃草稿并载入最新设置</button></div>}
    <fieldset disabled={busy} className="hda-settings-fields">
    {tab === 'model' ? <div className="hda-attached-settings">
      <div className="hda-section-title"><h3>贴身菜单</h3><span className="hda-tag">当前角色</span></div>
      <label>入口位置<select aria-label="贴身菜单位置" value={menu.side} onChange={e => editMenu({ side: e.target.value })}><option value="auto">自动</option><option value="left">左侧优先</option><option value="right">右侧优先</option></select></label>
      <label>高度微调 <span>{Math.round(menu.height * 100)}%</span><input aria-label="贴身菜单高度" type="range" min="-.15" max=".15" step=".01" value={menu.height} onChange={e => editMenu({ height: +e.target.value })}/></label>
      <label>贴身间距 <span>{menu.gap}px</span><input aria-label="贴身菜单间距" type="range" min="2" max="10" step="1" value={menu.gap} onChange={e => editMenu({ gap: +e.target.value })}/></label>
      <p className="hda-help">左侧预览会实时更新。保存后按角色记住；空间不足时会临时换侧避让。</p>
      <button type="button" className="hda-text-button" onClick={() => edit({ ...profile, attachedMenu: menuDefaults() })}>恢复自动贴身菜单</button>
    </div> : tab === 'motion' ? <>
      <div className="hda-section-title"><h3>动作库 <span>{data.assets.filter(a => a.kind === 'motion').length}</span></h3><span className="hda-tag">FBX</span></div>
      <p className="hda-help">本地动作已自动加入，也可上传 FBX（带皮肤或纯动作）。选择片段并预览后，可用于行走、待机或点击互动。</p>
      <input hidden ref={uploadInput} type="file" accept=".fbx" onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void upload(f, 'motion') }}/>
      <button type="button" className="hda-upload" disabled={busy} onClick={() => uploadInput.current?.click()}><UIIcon kind="upload"/>上传 FBX 动作</button>
      <label>选择动作<select aria-label="选择 FBX 动作" value={assetId} onChange={e => void selectMotion(e.target.value)}><option value="">选择动作</option>{data.assets.filter(a => a.kind === 'motion').map(a => <option key={a.id} value={a.id}>{a.name}</option>)}</select></label>
      {assetId && <>
        <label>名称<div className="hda-inline"><input aria-label="动作名称" value={name} maxLength={80} onChange={e => setName(e.target.value)}/><button type="button" className="hda-secondary" disabled={busy || !name.trim()} onClick={() => void perform(async () => { await request('companion/rename', { id: assetId, name }); await reload(); setNotice('名称已更新') })}>重命名</button></div></label>
        <label>动画片段<select aria-label="动画片段" value={clip} onChange={e => { setClip(Number(e.target.value)); setPreviewed('') }}>{clips.map(c => <option key={c.index} value={c.index}>{c.name || '片段 ' + (c.index + 1)} · {c.duration.toFixed(1)} 秒</option>)}</select></label>
        <div className="hda-inline"><button type="button" className="hda-secondary" disabled={!capabilities.motion || !clips.length} onClick={preview}>预览动作</button><button type="button" className="hda-secondary" disabled={!canBind} onClick={() => bind('walk')}>用作行走</button><button type="button" className="hda-secondary" disabled={!canBind} onClick={() => bind('idle')}>用作待机</button><button type="button" className="hda-secondary" disabled={!canBind || profile.interactions.length >= 12} onClick={bindInteraction}>用作互动</button><button type="button" className="hda-secondary" disabled={!canBind} onClick={() => { editInteraction({ motion: binding }); setNotice('已更新当前组合的动作，招呼语和表情保留。保存后生效。') }}>用于当前组合：{interaction.name}</button></div>
        {!capabilities.motion && <p className="hda-help">当前角色无法映射此类动作，请选择 VRM 或 Mixamo 骨架 GLB。</p>}
        <button type="button" className="hda-text-button hda-text-danger" onClick={() => setRemoveId(assetId)}>删除此动作</button>
      </>}
      <div className="hda-card"><h4>日常活动</h4><label className="hda-toggle"><input type="checkbox" checked={profile.roaming} onChange={e => edit({ ...profile, roaming: e.target.checked })}/>在页面内自由行走</label><label>行走速度 <span>{profile.speed} px/s</span><input type="range" min="15" max="70" value={profile.speed} onChange={e => edit({ ...profile, speed: +e.target.value })}/></label>
        <p>行走：{assetName(profile.walk)}</p><p>待机：{assetName(profile.idle)}</p><button type="button" className="hda-text-button" onClick={() => edit({ ...profile, walk: null, idle: null })}>恢复内置行走与待机</button>
      </div>
    </> : <>
      <div className="hda-section-title"><h3>点击互动</h3><span className="hda-tag">动作 · 表情 · 贴纸</span></div>
      <div className="hda-inline"><select aria-label="选择互动" value={interaction.id} onChange={e => setSelected(e.target.value)}>{profile.interactions.map(i => <option key={i.id} value={i.id}>{i.name}</option>)}</select><button type="button" className="hda-secondary" disabled={profile.interactions.length >= 12} onClick={() => { const next = { ...defaultProfile().interactions[0], id: crypto.randomUUID(), name: '新互动' }; edit({ ...profile, interactions: [...profile.interactions, next] }); setSelected(next.id) }}><UIIcon kind="plus"/>新建</button></div>
      <div className="hda-inline"><button type="button" className="hda-secondary" disabled={profile.interactions.length >= 12} onClick={copyInteraction}>复制当前组合</button><button type="button" className="hda-secondary" onClick={() => greetingInput.current?.click()}>导入招呼语</button></div>
      <input hidden ref={greetingInput} type="file" accept=".txt,.json" onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void importGreetings(f) }}/>
      <p className="hda-help">动作和招呼语可自由搭配。复制组合后修改即可保留原组合。导入 TXT（每行一句）或 JSON 字符串数组，每句最多 80 字；只追加，不覆盖。</p>
      <label>互动名称<input value={interaction.name} maxLength={40} onChange={e => editInteraction({ name: e.target.value })}/></label>
      <label className="hda-toggle"><input type="checkbox" checked={interaction.enabled} onChange={e => editInteraction({ enabled: e.target.checked })}/>参与点击互动</label>
      <section className="hda-field-group" aria-label="动作与表情"><h4>动作与表情</h4>
      {capabilities.alpha ? <p className="hda-help">点击时随机播放角色自带的回应动画；表情已包含在动画中。</p> : <>
      <label>身体动作<select value={interaction.motion ? 'fbx:' + interaction.motion.id : interaction.action} onChange={e => e.target.value.startsWith('fbx:') ? editInteraction({ motion: { id: e.target.value.slice(4), clip: 0 } }) : editInteraction({ action: e.target.value, motion: null, duration: Math.min(4, interaction.duration) })}><option value="wave">挥手</option><option value="head">好奇地转头</option><option value="idle">自然待机</option>{capabilities.motion && data.assets.filter(a => a.kind === 'motion').map(a => <option key={a.id} value={'fbx:' + a.id}>{a.name}</option>)}</select></label>
      {interaction.motion && <label>动画片段<select value={interaction.motion.clip} onChange={e => editInteraction({ motion: { ...interaction.motion!, clip: +e.target.value } })}>{interactionClips.map(c => <option key={c.index} value={c.index}>{c.name || '片段 ' + (c.index + 1)} · {c.duration.toFixed(1)} 秒</option>)}</select></label>}
      <label>脸部表情<select value={capabilities.expressions.includes(interaction.expression) ? interaction.expression : ''} onChange={e => editInteraction({ expression: e.target.value })}><option value="">自然表情</option>{capabilities.expressions.filter(e => !e.startsWith('blink') && !e.startsWith('look')).map(e => <option key={e} value={e}>{label[e] || e}</option>)}</select></label>
      {!capabilities.expressions.length && <p className="hda-help">此模型未提供脸部表情，仍可使用身体动作和贴纸。</p>}
      <label>表情强度 <span>{Math.round(interaction.intensity * 100)}%</span><input type="range" min="0" max="1" step=".05" value={interaction.intensity} onChange={e => editInteraction({ intensity: +e.target.value })}/></label>
      </>}
      <label>目光跟随<select disabled={!capabilities.gaze || capabilities.gaze === 'none'} value={profile.gaze || 'gentle'} onChange={e => edit({ ...profile, gaze: e.target.value as Profile['gaze'] })}><option value="off">关闭</option><option value="gentle">轻柔</option><option value="noticeable">明显</option></select></label>
      <small>{capabilities.gaze === 'eyes' ? '眼睛优先跟随，头部轻微辅助；动作播放时让动作优先。' : capabilities.gaze === 'head' ? '此角色支持轻微转头，没有可控眼部。' : '此角色没有可控的目光，保留自然姿态。'}</small>
      </section>
      <section className="hda-field-group" aria-label="贴纸与短句"><h4>贴纸与短句</h4>
      <label>头顶贴纸<select value={interaction.sticker} onChange={e => editInteraction({ sticker: e.target.value })}><option value="heart">♡ 爱心</option><option value="question">? 问号</option><option value="music">♫ 音符</option><option value="none">不显示贴纸</option>{data.assets.filter(a => a.kind === 'sticker').map(a => <option key={a.id} value={a.id}>{a.name}</option>)}</select></label>
      <input hidden ref={stickerInput} type="file" accept=".png,.webp,.gif" onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void upload(f, 'sticker') }}/>
      <div className="hda-inline"><button type="button" className="hda-secondary" disabled={busy} onClick={() => stickerInput.current?.click()}>上传表情贴纸</button>{data.assets.some(a => a.id === interaction.sticker) && <button type="button" className="hda-text-button hda-text-danger" onClick={() => setRemoveId(interaction.sticker)}>删除贴纸</button>}</div>
      <p className="hda-help">PNG / WebP / GIF · 最大 5 MB、2048 × 2048</p>
      <div className="hda-inline"><label>大小 {interaction.size}px<input type="range" min="32" max="128" value={interaction.size} onChange={e => editInteraction({ size: +e.target.value })}/></label><label>时长 {interaction.duration}s<input type="range" min="2" max={interaction.motion ? Math.max(4, interaction.duration, Math.ceil(interactionClips[interaction.motion.clip]?.duration || 4)) : 4} step=".5" value={interaction.duration} onChange={e => editInteraction({ duration: +e.target.value })}/></label></div>
      {interaction.motion && <button type="button" className="hda-text-button" disabled={!interactionClips[interaction.motion.clip]} onClick={() => editInteraction({ duration: Math.max(2, Math.min(600, Math.ceil(interactionClips[interaction.motion!.clip].duration * 2) / 2)) })}>按完整动作设置时长</button>}
      <label>想说的话<input maxLength={80} value={interaction.text} placeholder="可选，例如：今天也要开心呀" onChange={e => editInteraction({ text: e.target.value })}/></label>
      </section>
      <div className="hda-inline"><button type="button" className="hda-secondary" onClick={() => onPreview(interaction.action, interaction.motion, interaction)}>预览完整互动</button><button type="button" className="hda-text-button hda-text-danger" disabled={profile.interactions.length <= 1} onClick={() => edit({ ...profile, interactions: profile.interactions.filter(i => i.id !== interaction.id), daily: profile.daily?.filter(e => e.id !== interaction.id), events: Object.fromEntries(Object.entries(profile.events || {}).filter(([, id]) => id !== interaction.id)) })}>删除此互动</button></div>
      <details className="hda-behavior-settings"><summary>日常与会话状态</summary>
        <label className="hda-toggle"><input type="checkbox" checked={profile.dailyEnabled !== false} onChange={e => edit({ ...profile, dailyEnabled: e.target.checked })}/>偶尔做些小动作</label>
        <label className="hda-toggle"><input type="checkbox" checked={!!profile.daily?.some(e => e.id === interaction.id)} onChange={e => edit({ ...profile, daily: e.target.checked ? [...(profile.daily || []), { id: interaction.id, weight: 10, cooldown: 30 }] : profile.daily?.filter(e => e.id !== interaction.id) })}/>将当前互动加入日常候选</label>
        {profile.daily?.find(e => e.id === interaction.id) && <div className="hda-inline">
          <label>出现权重<input aria-label="日常动作权重" type="number" min="1" max="100" value={profile.daily.find(e => e.id === interaction.id)!.weight} onChange={e => edit({ ...profile, daily: profile.daily?.map(d => d.id === interaction.id ? { ...d, weight: +e.target.value } : d) })}/></label>
          <label>最短间隔（秒）<input aria-label="日常动作冷却" type="number" min="10" max="600" value={profile.daily.find(e => e.id === interaction.id)!.cooldown} onChange={e => edit({ ...profile, daily: profile.daily?.map(d => d.id === interaction.id ? { ...d, cooldown: +e.target.value } : d) })}/></label>
        </div>}
        <p className="hda-help">日常只播放动作和表情。会话状态只跟随当前打开的会话，点击后恢复。</p>
        {!capabilities.alpha && [['thinking','思考'],['working','工作'],['waiting','等待确认'],['success','完成'],['error','出错']].map(([state, title]) => <label key={state}>{title}<select aria-label={title + '状态互动'} value={profile.events?.[state] || ''} onChange={e => edit({ ...profile, events: { ...profile.events, [state]: e.target.value } })}><option value="">自动</option>{profile.interactions.filter(i => i.enabled).map(i => <option key={i.id} value={i.id}>{i.name}</option>)}</select></label>)}
      </details>
    </>}
    </fieldset>
    {removeId && <div className="hda-card"><p>删除后，使用它的组合将恢复内置资源。</p><div className="hda-inline"><button type="button" className="hda-danger" disabled={busy} onClick={() => void perform(async () => { await request('companion/delete', { id: removeId }); (await renderer()).forgetMotionAsset(removeId); const clean = structuredClone(profile); if (clean.walk?.id === removeId) clean.walk = null; if (clean.idle?.id === removeId) clean.idle = null; for (const i of clean.interactions) { if (i.motion?.id === removeId) { i.motion = null; i.duration = Math.min(4, i.duration) }; if (i.sticker === removeId) i.sticker = 'heart' }; edit(clean); if (assetId === removeId) void selectMotion(''); setRemoveId(''); onPreview('idle', null); await reload() })}>确认删除资源</button><button type="button" className="hda-secondary" onClick={() => setRemoveId('')}>取消</button></div></div>}
    {data.errors?.map(e => <p key={e.name} className="hda-error">{e.name}：{e.error}</p>)}
    {progress !== null && <div className="hda-progress"><progress aria-label="资源上传进度" max="100" value={progress}/><span>上传中 {progress}%</span><button type="button" onClick={() => xhr.current?.abort()}>取消</button></div>}
    <div className="hda-controls-feedback" role="status">{error ? <span className="hda-error">{error}</span> : motionStatus && !['ready','loading'].includes(motionStatus) ? <span className="hda-error">{motionStatus}</span> : notice || (motionStatus === 'loading' ? '正在适配动作…' : dirty ? '有未保存的设置' : '设置已保存，点击人物即可互动。')}</div>
  </form>
}

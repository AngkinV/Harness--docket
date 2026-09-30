import React, { useEffect, useState } from 'react'
import type { CompanionData, Binding } from './companion-controls'

export function MotionInspector({ data, enabled, basicEnabled, ready, action, status, renderer, preview }: { data: CompanionData; enabled: boolean; basicEnabled: boolean; ready: boolean; action: string; status: string; renderer: () => Promise<any>; preview: (action: string, binding: Binding, seconds?: number) => void }) {
  const [scope, setScope] = useState('all'), [asset, setAsset] = useState(''), [clip, setClip] = useState(0), [seconds, setSeconds] = useState(5)
  const [clips, setClips] = useState<any[]>([]), [error, setError] = useState(''), [loading, setLoading] = useState(false)
  const motions = data.assets.filter(a => a.kind === 'motion' && (scope === 'all' || (scope === 'uploaded' ? a.source !== 'local' : a.source === 'local')))
  useEffect(() => {
    let active = true; setClips([]); setError(''); setLoading(!!asset)
    if (asset) renderer().then(m => m.motionAsset(asset)).then(parsed => { if (active) setClips(parsed.clips) }).catch(e => { if (active) setError(e.message) }).finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [asset])
  useEffect(() => { if (asset && !motions.some(a => a.id === asset)) { setAsset(''); preview('idle', null) } }, [data.assets, scope])
  return <div className="hda-motion-inspector">
    <div className="hda-inspector-heading"><span>动作检查</span><small>仅预览 · 不修改绑定</small></div>
    <label>动作来源<select aria-label="检查动作来源" value={scope} onChange={e => setScope(e.target.value)}><option value="all">全部动作</option><option value="uploaded">用户上传</option><option value="local">本地导入</option></select></label>
    <label>检查动作<select aria-label="检查动作" value={asset ? 'fbx:' + asset : action} disabled={!ready || (!enabled && !basicEnabled)} onChange={e => { const value = e.target.value; setClip(0); setAsset(value.startsWith('fbx:') ? value.slice(4) : ''); preview(value.startsWith('fbx:') ? 'idle' : value, null) }}>
      <optgroup label="基础检查"><option value="walk">行走</option><option value="wave">挥手</option><option value="idle">待机</option><option value="left">左臂抬起与屈肘</option><option value="right">右臂抬起与屈肘</option><option value="head">转头</option><option value="rest">原始姿态</option></optgroup>
      <optgroup label="资源库动作">{motions.map(a => <option key={a.id} value={'fbx:' + a.id} disabled={!enabled}>{a.name}</option>)}</optgroup>
    </select></label>
    {asset && <><label>片段<select aria-label="检查动作片段" value={clip} disabled={loading} onChange={e => setClip(+e.target.value)}>{clips.map((c, i) => <option key={i} value={i}>{c.name || '片段 ' + (i + 1)} · {c.duration.toFixed(1)} 秒</option>)}</select></label><label>检查时限<select aria-label="检查时限" value={seconds} onChange={e => setSeconds(+e.target.value)}>{[3,5,10,15].map(n => <option key={n} value={n}>{n} 秒</option>)}</select></label><button type="button" className="hda-secondary" disabled={!ready || !enabled || !clips[clip] || loading} onClick={() => preview('idle', { id: asset, clip }, seconds)}>播放检查动作</button><button type="button" className="hda-text-button" onClick={() => preview('idle', null)}>停止检查</button></>}
    <p className="hda-inspector-note" role="status">{error || (status && !['ready','loading'].includes(status) ? status : loading ? '正在读取动作片段…' : !enabled ? '当前模型保留自身动画；FBX 检查需要可映射的人形骨架。' : !motions.length ? '此范围暂无动作，可前往动作库上传。' : asset ? '检查最多 15 秒，到时恢复待机。' : '可检查基础姿态或选择资源库中的动作。')}</p>
  </div>
}

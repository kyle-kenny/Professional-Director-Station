import type { AudioClip, AssetRef, DirectorLight, WorkspaceMode } from '../domain/model';
import type { ProjectRole } from '../domain/collaboration';

export const workspaceZh: Record<WorkspaceMode, string> = {
  '3d': '3D 导演台', floorplan: '2D 站位', frame: '2D 构图', timeline: '时间线 / 声音', assets: '资产库', review: '协作 / 审片', pipeline: '制作管线', ai: 'AI 制作',
};
export const shotStatusZh = { WIP: '制作中', REVIEW: '审片中', APPROVED: '已批准' } as const;
export const audioKindZh: Record<AudioClip['kind'], string> = { dialogue: '对白', music: '音乐', sfx: '音效', ambience: '环境声' };
export const lightTypeZh: Record<DirectorLight['type'], string> = { directional: '平行光', point: '点光源', spot: '聚光灯', area: '区域光', ambient: '环境光' };
export const assetCategoryZh: Record<AssetRef['category'], string> = { character: '角色', environment: '环境', prop: '道具', vehicle: '载具', camera: '摄影机', light: '灯光', pose: '姿势', motion: '动作', audio: '音频', storyboard: '故事板', video: '视频' };
export const roleZh: Record<ProjectRole, string> = { owner: '所有者', director: '导演', editor: '编辑', reviewer: '审片人', viewer: '只读查看' };
export const sexZh = { male: '男性', female: '女性' } as const;
export const ageGroupZh = { child: '儿童', teen: '青少年', adult: '成年', elderly: '老年' } as const;
export const postureZh = { upright: '直立', relaxed: '放松', elderly: '老年体态' } as const;
export const uiZh = {
  projectTitle: '专业导演工作站', saveProject: '导出工程', loadProject: '导入工程', undo: '撤销', redo: '重做', connect: '连接', disconnect: '断开', loadingCharacter: '正在加载开源角色…', characterReady: '开源正式角色已加载', characterFailed: '角色资源加载失败', approvedReadonly: '已批准 · 只读；请在审片工作区创建新的制作中版本', sourceOpenCharacter: 'Quaternius CC0 开源角色',
} as const;

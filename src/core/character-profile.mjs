export const CHARACTER_OPTIONS = Object.freeze([
  { id: 'american-shorthair', label: '美短', detail: '银虎斑小猫', kind: 'animal', sheet: 'animal', sprite: '0% 0%' },
  { id: 'maine-coon', label: '缅因', detail: '蓬松大尾巴', kind: 'animal', sheet: 'animal', sprite: '50% 0%' },
  { id: 'ragdoll', label: '布偶', detail: '蓝眼睛小猫', kind: 'animal', sheet: 'animal', sprite: '100% 0%' },
  { id: 'shiba', label: '柴犬', detail: '元气小狗', kind: 'animal', sheet: 'animal', sprite: '0% 100%' },
  { id: 'teddy-bear', label: '小熊', detail: '软乎乎伙伴', kind: 'animal', sheet: 'animal', sprite: '50% 100%' },
  { id: 'lop-bunny', label: '垂耳兔', detail: '安静小兔', kind: 'animal', sheet: 'animal', sprite: '100% 100%' },
  { id: 'tomato', label: '小番茄', detail: '元气果实', kind: 'food', sheet: 'nature', sprite: '0% 0%' },
  { id: 'apple', label: '苹果', detail: '红扑扑伙伴', kind: 'food', sheet: 'nature', sprite: '50% 0%' },
  { id: 'strawberry', label: '草莓', detail: '甜甜小伙伴', kind: 'food', sheet: 'nature', sprite: '100% 0%' },
  { id: 'monstera', label: '龟背竹', detail: '慢慢长大', kind: 'plant', sheet: 'nature', sprite: '0% 100%' },
  { id: 'sunflower', label: '向日葵', detail: '向着光亮', kind: 'plant', sheet: 'nature', sprite: '50% 100%' },
  { id: 'cactus', label: '仙人掌', detail: '安静坚韧', kind: 'plant', sheet: 'nature', sprite: '100% 100%' },
]);

export const CHARACTER_IDS = Object.freeze(CHARACTER_OPTIONS.map((option) => option.id));

export function characterOption(avatarId) {
  return CHARACTER_OPTIONS.find((option) => option.id === avatarId) || CHARACTER_OPTIONS[0];
}

export function normalizeCharacterProfile(value = {}) {
  if (!value || typeof value !== 'object') return null;
  const name = String(value.name || '').trim().slice(0, 24);
  if (!name) return null;
  return { name, avatarId: characterOption(value.avatarId).id };
}

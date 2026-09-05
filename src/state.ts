export type WorkStatus = 'available' | 'sorting' | 'hauling' | 'delivered' | 'paid';
export type Item = 'raincoat' | 'mattress' | 'bicycle';
export interface GameState {
  version: 1; day: number; cash: number; work: WorkStatus;
  sorted: number; correct: number; checkpoint: number; deliveries: number;
  inventory: Item[]; relationship: number; talkedDay: number; evening: 'none' | 'friends' | 'quiet';
  location: 'street' | 'room'; x: number; z: number; minutes: number;
}
export const PRICES: Record<Item, number> = { raincoat: 60, mattress: 260, bicycle: 480 };
export const ITEMS: Record<Item, { name: string; description: string }> = {
  raincoat: { name: '一件好雨衣', description: '备着就安心。运货时更稳，操作失误不再减少质量奖励。' },
  mattress: { name: '舒服一点的床垫', description: '回房间就能看到新床品和一盏暖灯。明天开始，多留十五分钟给自己。' },
  bicycle: { name: '二手通勤车', description: '车子不新，刹车很稳。在街上按 B 骑行，少花一点时间在路上。' },
};
export const PACKAGES = [
  { name: '蓝牙耳机', detail: '电子产品 · 防压', type: 0 },
  { name: '玻璃杯', detail: '易碎物品 · 轻放', type: 2 },
  { name: '鲜牛奶', detail: '冷藏食品 · 优先', type: 1 },
  { name: '手机充电器', detail: '电子产品 · 防潮', type: 0 },
  { name: '冰鲜水果', detail: '冷藏食品 · 优先', type: 1 },
  { name: '陶瓷碗', detail: '易碎物品 · 轻放', type: 2 },
  { name: '小音箱', detail: '电子产品 · 防压', type: 0 },
  { name: '酸奶', detail: '冷藏食品 · 优先', type: 1 },
  { name: '相框', detail: '易碎物品 · 轻放', type: 2 },
];
export const freshState = (): GameState => ({version:1,day:1,cash:180,work:'available',sorted:0,correct:0,checkpoint:0,deliveries:0,inventory:[],relationship:0,talkedDay:0,evening:'none',location:'street',x:1,z:11,minutes:18*60+12});
export function validateSave(input: unknown): GameState | null {
  if (!input || typeof input !== 'object') return null;
  const s=input as GameState;
  if(s.version!==1 || !Number.isInteger(s.day) || s.day<1 || s.day>9999 || !Number.isFinite(s.cash) || s.cash<0 || s.cash>1e9) return null;
  if(!['available','sorting','hauling','delivered','paid'].includes(s.work)) return null;
  if(!Array.isArray(s.inventory) || s.inventory.some(i=>!Object.hasOwn(PRICES,i)) || new Set(s.inventory).size!==s.inventory.length) return null;
  if(!Number.isInteger(s.sorted)||s.sorted<0||s.sorted>9||!Number.isInteger(s.correct)||s.correct<0||s.correct>s.sorted) return null;
  if(!Number.isInteger(s.checkpoint)||s.checkpoint<0||s.checkpoint>3) return null;
  if(!['street','room'].includes(s.location)||!['none','friends','quiet'].includes(s.evening))return null;
  for(const key of ['x','z','minutes','relationship','talkedDay','deliveries'] as const) if(!Number.isFinite(s[key]))return null;
  if(s.work==='available' && (s.sorted!==0||s.checkpoint!==0))return null;
  if(['hauling','delivered','paid'].includes(s.work)&&s.sorted!==9)return null;
  if(['delivered','paid'].includes(s.work)&&s.checkpoint!==3)return null;
  const out=structuredClone(s);
  out.x=Math.max(-5.4,Math.min(5.4,out.x)); out.z=Math.max(2,Math.min(98,out.z));
  return out;
}
export function startWork(s: GameState): boolean {
  if(s.work!=='available')return false;
  s.work='sorting';s.sorted=0;s.correct=0;s.checkpoint=0;return true;
}
export function sortParcel(s: GameState, category: number): { correct: boolean; done: boolean } | null {
  if(s.work!=='sorting'||s.sorted>=PACKAGES.length||![0,1,2].includes(category))return null;
  const correct=PACKAGES[s.sorted].type===category;
  s.correct+=correct?1:0;s.sorted++;
  if(s.sorted===PACKAGES.length)s.work='hauling';
  return {correct,done:s.work==='hauling'};
}
export function advanceCheckpoint(s: GameState,index: number): boolean {
  if(s.work!=='hauling'||index!==s.checkpoint||index>=3)return false;
  s.checkpoint++;if(s.checkpoint===3)s.work='delivered';return true;
}
export function payout(s: GameState): { base:number;bonus:number;cost:number;net:number } | null {
  if(s.work!=='delivered')return null;
  const bonus=s.inventory.includes('raincoat')?40:Math.round(s.correct/9*40);
  const result={base:280,bonus,cost:107,net:173+bonus};
  s.cash+=result.net;s.work='paid';s.deliveries++;return result;
}
export function buy(s: GameState,item: Item): boolean {
  if(!Object.hasOwn(PRICES,item)||s.inventory.includes(item)||s.cash<PRICES[item])return false;
  s.cash-=PRICES[item];s.inventory.push(item);return true;
}
export function meet(s: GameState,choice:'friends'|'quiet'): boolean {
  if(s.work!=='paid'||s.evening!=='none')return false;
  s.evening=choice;if(choice==='friends')s.relationship++;
  return true;
}
export function nextDay(s: GameState): boolean {
  if(s.work!=='paid')return false;
  s.day++;s.work='available';s.sorted=0;s.correct=0;s.checkpoint=0;s.evening='none';
  s.minutes=18*60+(s.inventory.includes('mattress')?0:15);s.location='street';s.x=-5;s.z=54;
  return true;
}

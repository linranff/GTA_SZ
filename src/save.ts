import { validateSave, type GameState } from './state.ts';
const DB='shenchengji-v1';
let database: Promise<IDBDatabase> | null=null;
function open(): Promise<IDBDatabase> {
  return database??=(new Promise((resolve,reject)=>{
    const request=indexedDB.open(DB,1);
    request.onupgradeneeded=()=>request.result.createObjectStore('saves');
    request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);
  }));
}
export async function loadSave(): Promise<GameState|null> {
  const db=await open();
  return new Promise((resolve,reject)=>{
    const r=db.transaction('saves').objectStore('saves').get('main');
    r.onsuccess=()=>resolve(validateSave(r.result));r.onerror=()=>reject(r.error);
  });
}
export async function saveGame(state: GameState): Promise<void> {
  const copy=structuredClone(state);const db=await open();
  return new Promise((resolve,reject)=>{
    const tx=db.transaction('saves','readwrite');tx.objectStore('saves').put(copy,'main');
    tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);
  });
}

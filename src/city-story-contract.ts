/** Shared first-playable contract. Owned by the integrator; content and runtime workers read it. */
export type StoryPlace = 'hub' | 'bay' | 'office' | 'park' | 'workshop';
export type StoryPoint = [number, number];
export type StorySpeaker = 'ahui' | 'alin' | 'laochen' | 'player';
export type StoryLine = {speaker: StorySpeaker; text: string};
export type StoryChoice = {id: string; label: string; next: string; consequence: string};
export type StoryStep = {
  id: string; place: StoryPlace; title: string; objective: string;
  action: 'talk' | 'collect' | 'deliver'; lines: StoryLine[];
  next?: string; choices?: StoryChoice[]; terminal?: boolean;
};
export type CityStoryContent = {
  schemaVersion: 1; id: 'bay-last-delivery'; title: string; synopsis: string;
  firstStep: string; reward: number;
  people: Record<StorySpeaker, {name: string; role: string}>;
  steps: StoryStep[];
};
export type StoryFrame = {
  x: number; z: number; speed: number; inVehicle: boolean;
  paused: boolean; blocked: boolean; debugEpoch: number;
};
export type StoryHooks = {
  places: Record<StoryPlace, StoryPoint>; frame: () => StoryFrame;
  navigate: (point: StoryPoint, title: string) => void; clearRoute: () => void;
  toast: (text: string) => void; setModalOpen: (open: boolean) => void;
  /** Idempotent wallet credit. false means unavailable; retry must not duplicate payment. */
  credit: (id: string, amount: number) => boolean;
};


export interface GameState {
  isPlaying: boolean;
  currentSceneId: string | null;
  inventory: string[];
  history: LogEntry[];
  
  // Visual State
  imageUrl: string | null;
  hotspots: Hotspot[];
  
  // UI State
  isLoading: boolean;
  loadingMessage: string;
  gameOver: boolean;
  theme: string;

  // Cache
  sceneCache: Record<string, SceneData>;
}

export interface SceneData {
  id: string;
  visualDescription: string;
  imageUrl: string;
  hotspots: Hotspot[];
  interactables: string[];
}

export interface LogEntry {
  type: 'narrator' | 'command' | 'error';
  text: string;
}

export interface Hotspot {
  name: string;
  box: [number, number, number, number]; // ymin, xmin, ymax, xmax (0-100 percentages)
}

export interface AdventureResponse {
  narrative: string;
  scene_id: string; // e.g., "kitchen", "forest_clearing"
  visual_description: string;
  trigger_visual_update: boolean; // Should we regenerate the image?
  interactables: string[]; // List of items visible in the scene
  inventory_add?: string;
  inventory_remove?: string;
  is_game_over?: boolean;
}

export enum Verb {
  Give = "Give",
  Open = "Open",
  Close = "Close",
  PickUp = "Pick up",
  LookAt = "Look at",
  TalkTo = "Talk to",
  Use = "Use",
  Push = "Push",
  Pull = "Pull",
  WalkTo = "Walk to"
}

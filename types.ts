
export interface ChatMessage {
  id: string;
  senderId: string; // 'coach' oder die jeweilige clientId
  text: string;
  timestamp: number;
}

export interface Set {
  id: string;
  workoutId: string;
  setNumber: number;
  weight: number;
  reps: number;
}

export interface Workout {
  id: string;
  dayId: string;
  exerciseName: string;
  order: number;
  sets: Set[];
}

export interface Nutrition {
  id: string;
  dayId: string;
  protein: number;
  carbs: number;
  fat: number;
  calories: number;
}

export interface DayRecord {
  id: string;
  date: string; // ISO format YYYY-MM-DD
  workouts: Workout[];
  nutrition: Nutrition | null;
  bodyWeight?: number;
  steps?: number;
  note?: string;
  photos?: string[]; // Array von Base64 Bild-Strings (max 4)
  // Planungswerte (vom Coach gesetzt)
  plannedNutrition?: Nutrition;
  plannedSteps?: number;
}

export interface ClientTargets {
  protein: number;
  carbs: number;
  fat: number;
  steps: number;
  calories: number;
}

export interface ClientProfile {
  id: string;
  name: string;
  password: string;
  isActive: boolean; // Manuelle Deaktivierung
  subscriptionExpiresAt?: number; // Zeitlimit als Timestamp
  targets: ClientTargets;
  records: Record<string, DayRecord>;
  messages?: ChatMessage[];
  hasUnreadCoachMsg?: boolean; 
  hasUnreadClientMsg?: boolean; 
}

export interface AppState {
  clients: Record<string, ClientProfile>;
  activeClientId: string;
}

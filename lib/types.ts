// How each kind of thing behaves in the forms. Names match object_types.name.
export const CHORE = 'Chore or task';
export const ACTIVITY = 'Activities';

export const isChore = (typeName: string | null | undefined) => typeName === CHORE;
export const isActivity = (typeName: string | null | undefined) => typeName === ACTIVITY;

interface TypeUi {
  placeholder: string;
  ownerQuestion: string;
  /** Things that fall due by nature ask about it up front; for the rest a reminder is optional and folded away. */
  dueQuestion?: string;
}

const UI: Record<string, TypeUi> = {
  [CHORE]: { placeholder: 'e.g. Dishes, Feed the hens, Pick up parcel', ownerQuestion: 'Who does it?', dueQuestion: 'When does it need doing?' },
  [ACTIVITY]: { placeholder: 'e.g. Scouts, Band practice, Work', ownerQuestion: 'Whose is it?' },
  Document: { placeholder: 'e.g. Ziah’s passport', ownerQuestion: 'Whose is it?', dueQuestion: 'When does it expire?' },
  Bill: { placeholder: 'e.g. Electricity', ownerQuestion: 'Who pays it?', dueQuestion: 'When is it due?' },
  Subscription: { placeholder: 'e.g. Netflix', ownerQuestion: 'Who looks after it?', dueQuestion: 'When does it renew?' },
  Vehicle: { placeholder: 'e.g. Kia', ownerQuestion: 'Who looks after it?' },
  Machine: { placeholder: 'e.g. Chainsaw', ownerQuestion: 'Who looks after it?' },
  'Animal or flock': { placeholder: 'e.g. Clyde, or The hens', ownerQuestion: 'Who looks after it?' },
  'Home system': { placeholder: 'e.g. Well water filter', ownerQuestion: 'Who looks after it?' },
  Person: { placeholder: 'e.g. Benji', ownerQuestion: 'Who looks after it?' },
};

export const typeUi = (typeName: string): TypeUi =>
  UI[typeName] ?? { placeholder: 'Give it a name', ownerQuestion: 'Who looks after it?' };

/** The app's own kinds: their names drive how forms behave, so they can't be renamed or removed. */
export const isBuiltInKind = (typeName: string) => typeName in UI;

/** Details the app relies on for a built-in kind. */
export const isLockedField = (typeName: string, key: string) =>
  (typeName === CHORE && key === 'picture') || (typeName === 'Animal or flock' && ['photo', 'birth_year', 'head_count'].includes(key));

/** How each kind of detail is described to parents. */
export const FIELD_KINDS = [
  ['text', 'Words'],
  ['number', 'A number'],
  ['date', 'A date'],
  ['choice', 'Pick from a list'],
  ['person', 'Someone in the family'],
  ['photo', 'A photo'],
] as const;
export type FieldKindChoice = (typeof FIELD_KINDS)[number][0];

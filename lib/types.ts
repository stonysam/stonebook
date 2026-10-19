// How each kind of thing behaves in the forms. Names match object_types.name.
export const CHORE = 'Chore or task';
export const ACTIVITY = 'Activity or work';

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
  'Animal or flock': { placeholder: 'e.g. Sheep flock', ownerQuestion: 'Who looks after them?' },
  'Home system': { placeholder: 'e.g. Well water filter', ownerQuestion: 'Who looks after it?' },
  Person: { placeholder: 'e.g. Benji', ownerQuestion: 'Who looks after it?' },
};

export const typeUi = (typeName: string): TypeUi =>
  UI[typeName] ?? { placeholder: 'Give it a name', ownerQuestion: 'Who looks after it?' };

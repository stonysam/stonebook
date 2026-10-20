import {
  Baby, Bike, Bird, BookOpen, CalendarDays, Car, Cat, Dog, Droplet, Dumbbell, Fish, Flame, Flower2, Gift, GraduationCap,
  Hammer, Heart, House, IdCard, Key, Laptop, ListChecks, Music, Package, PawPrint, Plane, Receipt, Repeat, ShoppingCart,
  Smartphone, Sprout, Stethoscope, Tent, Tractor, Trees, User, Utensils, Wrench, Zap, type LucideIcon,
} from 'lucide-react';

/** Icons for kinds of things, by the name stored in object_types.icon. */
export const KIND_ICONS: Record<string, LucideIcon> = {
  check: ListChecks, calendar: CalendarDays, user: User, receipt: Receipt, 'id-card': IdCard, repeat: Repeat,
  home: House, tractor: Tractor, paw: PawPrint, car: Car,
  box: Package, bike: Bike, tent: Tent, sprout: Sprout, flower: Flower2, trees: Trees, wrench: Wrench, hammer: Hammer,
  zap: Zap, droplet: Droplet, flame: Flame, key: Key, laptop: Laptop, phone: Smartphone, book: BookOpen,
  school: GraduationCap, health: Stethoscope, baby: Baby, dog: Dog, cat: Cat, bird: Bird, fish: Fish, music: Music,
  sport: Dumbbell, plane: Plane, shopping: ShoppingCart, food: Utensils, gift: Gift, heart: Heart,
};

export function KindIcon({ name, size = 28 }: { name: string | null | undefined; size?: number }) {
  const Icon = KIND_ICONS[name ?? ''] ?? Package;
  return <Icon size={size} strokeWidth={1.75} aria-hidden />;
}

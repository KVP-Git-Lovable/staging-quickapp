import { ShoppingCart, MapPin, Store, UserCheck, Package, Route, Target, ClipboardList, Trophy } from "lucide-react";

const MAP: Record<string, any> = {
  "shopping-cart": ShoppingCart,
  "map-pin": MapPin,
  store: Store,
  "building-store": Store,
  "user-check": UserCheck,
  package: Package,
  route: Route,
  target: Target,
  clipboard: ClipboardList,
  "clipboard-data": ClipboardList,
};

export function CategoryIcon({ name, className }: { name?: string; className?: string }) {
  const Cmp = MAP[name ?? ""] ?? Trophy;
  return <Cmp className={className} />;
}

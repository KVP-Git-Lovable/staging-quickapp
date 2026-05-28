import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { 
  ShoppingCart, TrendingUp, Zap, Package, Star, Target, 
  ArrowRight, Sparkles, Calendar 
} from "lucide-react";

interface LoyaltyCrossSellCardProps {
  retailerId: string;
  actions: Array<{
    id: string;
    action_type: string;
    action_name: string;
    points: number;
    target_config?: Record<string, any>;
  }>;
  currentPoints: number;
  nextReward: {
    reward_name: string;
    points_required: number;
  } | null;
}

interface CrossSellSuggestion {
  type: "loyalty" | "product" | "order";
  icon: React.ElementType;
  title: string;
  description: string;
  points?: number;
  priority: number;
}

export function LoyaltyCrossSellCard({ 
  retailerId, 
  actions, 
  currentPoints,
  nextReward 
}: LoyaltyCrossSellCardProps) {
  
  // Fetch retailer's order history to generate suggestions
  const { data: orderHistory } = useQuery({
    queryKey: ["retailer-order-history-suggestions", retailerId],
    queryFn: async () => {
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      
      const { data, error } = await supabase
        .from("orders")
        .select("id, total_amount, created_at, order_items!order_items_order_id_fkey(product_name)")
        .eq("retailer_id", retailerId)
        .gte("created_at", thirtyDaysAgo.toISOString())
        .order("created_at", { ascending: false });
      
      if (error) throw error;
      return data;
    },
  });

  // Fetch popular products
  const { data: popularProducts } = useQuery<Array<{ id: string; name: string }>>({
    queryKey: ["popular-products-for-retailer", retailerId],
    queryFn: async () => {
      // Using explicit any to avoid deep type instantiation from products table
      const result = await (supabase as any)
        .from("products")
        .select("id, name")
        .eq("status", "active")
        .limit(5);
      
      if (result.error) throw result.error;
      return (result.data ?? []) as Array<{ id: string; name: string }>;
    },
  });

  // Generate suggestions based on available actions and order history
  const suggestions: CrossSellSuggestion[] = [];

  // Check for order frequency action
  const frequencyAction = actions.find(a => a.action_type === "order_frequency");
  if (frequencyAction) {
    const ordersThisMonth = orderHistory?.length || 0;
    const target = (frequencyAction.target_config as any)?.orders_per_month || 4;
    const remaining = target - ordersThisMonth;
    
    if (remaining > 0) {
      suggestions.push({
        type: "loyalty",
        icon: Calendar,
        title: `${remaining} more order${remaining > 1 ? 's' : ''} this month`,
        description: `Earn ${frequencyAction.points} bonus points for reaching ${target} orders/month`,
        points: frequencyAction.points,
        priority: 1,
      });
    }
  }

  // Check for consecutive orders action
  const streakAction = actions.find(a => a.action_type === "consecutive_orders");
  if (streakAction) {
    suggestions.push({
      type: "loyalty",
      icon: Zap,
      title: "Keep the streak going!",
      description: `Order within 7 days to maintain streak and earn ${streakAction.points} pts`,
      points: streakAction.points,
      priority: 2,
    });
  }

  // Check for order value tiers
  const tierAction = actions.find(a => a.action_type === "order_value_tiers");
  if (tierAction && (tierAction.target_config as any)?.min_value) {
    const minValue = (tierAction.target_config as any).min_value;
    suggestions.push({
      type: "order",
      icon: TrendingUp,
      title: `Order ₹${minValue.toLocaleString()}+ for bonus`,
      description: `Orders above ₹${minValue.toLocaleString()} earn ${tierAction.points} extra points`,
      points: tierAction.points,
      priority: 3,
    });
  }

  // Check for bulk order action
  const bulkAction = actions.find(a => a.action_type === "bulk_order");
  if (bulkAction) {
    const minQty = (bulkAction.target_config as any)?.min_quantity || 50;
    suggestions.push({
      type: "order",
      icon: Package,
      title: `Bulk order bonus available`,
      description: `Order ${minQty}+ units to earn ${bulkAction.points} bonus points`,
      points: bulkAction.points,
      priority: 4,
    });
  }

  // Add product suggestions
  const purchasedProducts = new Set(
    orderHistory?.flatMap(o => o.order_items?.map((i: any) => i.product_name) || [])
  );
  
  const newProducts = popularProducts?.filter(p => !purchasedProducts.has(p.name)).slice(0, 2);
  const newProductAction = actions.find(a => a.action_type === "new_product_trial");
  
  if (newProducts && newProducts.length > 0 && newProductAction) {
    suggestions.push({
      type: "product",
      icon: Sparkles,
      title: `Try: ${newProducts.map(p => p.name).join(", ")}`,
      description: `New product trials earn ${newProductAction.points} pts each`,
      points: newProductAction.points * newProducts.length,
      priority: 5,
    });
  }

  // Add reward milestone suggestion if close
  if (nextReward) {
    const pointsNeeded = nextReward.points_required - currentPoints;
    if (pointsNeeded <= 500) {
      suggestions.push({
        type: "loyalty",
        icon: Star,
        title: `Only ${pointsNeeded} pts to ${nextReward.reward_name}!`,
        description: "Place an order today to reach your next reward",
        priority: 0,
      });
    }
  }

  // Sort by priority
  suggestions.sort((a, b) => a.priority - b.priority);

  if (suggestions.length === 0) {
    return (
      <Card className="bg-muted/30">
        <CardContent className="py-4 text-center">
          <Sparkles className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
          <p className="text-sm text-muted-foreground">
            No specific suggestions at this time. Keep ordering to earn points!
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-2">
      {suggestions.slice(0, 4).map((suggestion, idx) => {
        const Icon = suggestion.icon;
        return (
          <Card 
            key={idx} 
            className={`${suggestion.priority === 0 ? 'border-yellow-400 bg-yellow-50' : 'bg-muted/30'}`}
          >
            <CardContent className="py-3 px-4">
              <div className="flex items-start gap-3">
                <div className={`p-2 rounded-lg ${suggestion.priority === 0 ? 'bg-yellow-200' : 'bg-primary/10'}`}>
                  <Icon className={`h-4 w-4 ${suggestion.priority === 0 ? 'text-yellow-700' : 'text-primary'}`} />
                </div>
                <div className="flex-1 min-w-0">
                  <h4 className="text-sm font-medium">{suggestion.title}</h4>
                  <p className="text-xs text-muted-foreground">{suggestion.description}</p>
                </div>
                {suggestion.points && (
                  <Badge variant="secondary" className="shrink-0">
                    +{suggestion.points} pts
                  </Badge>
                )}
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

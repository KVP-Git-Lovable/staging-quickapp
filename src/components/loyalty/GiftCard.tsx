import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CachedImg } from "@/components/CachedImg";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { 
  Gift, Clock, CheckCircle, Star, Timer, Target,
  AlertCircle, Package
} from "lucide-react";
import { differenceInDays, format } from "date-fns";

interface GiftCardProps {
  gift: {
    id: string;
    gift_name: string;
    description?: string | null;
    gift_type: string;
    points_required: number;
    cash_equivalent?: number | null;
    image_url?: string | null;
    stock_quantity?: number | null;
    is_limited_stock?: boolean | null;
    target_duration_months?: number | null;
    minimum_monthly_orders?: number | null;
    minimum_order_value?: number | null;
  };
  currentPoints: number;
  isSubscribed?: boolean;
  targetDate?: string | null;
  onSubscribe?: () => void;
  onRedeem?: () => void;
  canRedeem?: boolean;
  isSubscribing?: boolean;
}

export function GiftCard({ 
  gift, 
  currentPoints, 
  isSubscribed,
  targetDate,
  onSubscribe,
  onRedeem,
  canRedeem,
  isSubscribing
}: GiftCardProps) {
  const progress = Math.min((currentPoints / gift.points_required) * 100, 100);
  const pointsNeeded = Math.max(gift.points_required - currentPoints, 0);
  const isEligible = currentPoints >= gift.points_required;
  const daysToTarget = targetDate ? differenceInDays(new Date(targetDate), new Date()) : null;

  const getGiftTypeLabel = (type: string) => {
    switch (type) {
      case "physical": return "Physical Gift";
      case "voucher": return "Voucher";
      case "cash": return "Cash Reward";
      case "experience": return "Experience";
      default: return type;
    }
  };

  const getGiftTypeIcon = (type: string) => {
    switch (type) {
      case "physical": return <Package className="h-3 w-3" />;
      case "voucher": return <Gift className="h-3 w-3" />;
      case "cash": return <Star className="h-3 w-3" />;
      default: return <Gift className="h-3 w-3" />;
    }
  };

  return (
    <Card className={`overflow-hidden transition-all ${
      isSubscribed 
        ? "border-primary bg-primary/5" 
        : isEligible 
          ? "border-green-300 bg-green-50/50" 
          : ""
    }`}>
      <CardContent className="p-4">
        <div className="flex gap-3">
          {/* Gift Image/Icon */}
          <div className={`w-16 h-16 rounded-lg flex items-center justify-center shrink-0 ${
            isEligible ? "bg-green-100" : "bg-muted"
          }`}>
            {gift.image_url ? (
              <CachedImg
                url={gift.image_url}
                alt={gift.gift_name}
                className="w-full h-full object-cover rounded-lg"
              />
            ) : (
              <Gift className={`h-8 w-8 ${isEligible ? "text-green-600" : "text-muted-foreground"}`} />
            )}
          </div>

          {/* Gift Details */}
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2">
              <div>
                <h4 className="font-semibold text-sm">{gift.gift_name}</h4>
                <div className="flex items-center gap-2 mt-0.5">
                  <Badge variant="secondary" className="text-xs px-1.5 py-0">
                    {getGiftTypeIcon(gift.gift_type)}
                    <span className="ml-1">{getGiftTypeLabel(gift.gift_type)}</span>
                  </Badge>
                  {gift.is_limited_stock && gift.stock_quantity && gift.stock_quantity < 10 && (
                    <Badge variant="destructive" className="text-xs px-1.5 py-0">
                      <AlertCircle className="h-3 w-3 mr-1" />
                      Only {gift.stock_quantity} left
                    </Badge>
                  )}
                </div>
              </div>
              {isSubscribed && (
                <Badge className="bg-primary text-primary-foreground shrink-0">
                  <Target className="h-3 w-3 mr-1" />
                  Your Goal
                </Badge>
              )}
            </div>

            {gift.description && (
              <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                {gift.description}
              </p>
            )}

            {/* Progress Bar */}
            <div className="mt-3">
              <Progress value={progress} className="h-2" />
              <div className="flex justify-between mt-1">
                <span className="text-xs text-muted-foreground">
                  {currentPoints.toLocaleString()} / {gift.points_required.toLocaleString()} pts
                </span>
                {isEligible ? (
                  <span className="text-xs text-green-600 font-medium flex items-center gap-1">
                    <CheckCircle className="h-3 w-3" />
                    Ready!
                  </span>
                ) : (
                  <span className="text-xs text-muted-foreground">
                    {pointsNeeded.toLocaleString()} more
                  </span>
                )}
              </div>
            </div>

            {/* Target Date / Duration */}
            {(targetDate || gift.target_duration_months) && (
              <div className="flex items-center gap-1 mt-2 text-xs text-muted-foreground">
                <Clock className="h-3 w-3" />
                {targetDate ? (
                  <>
                    Target: {format(new Date(targetDate), "dd MMM yyyy")}
                    {daysToTarget !== null && daysToTarget > 0 && (
                      <Badge variant="outline" className="ml-2 text-xs px-1.5 py-0">
                        <Timer className="h-3 w-3 mr-1" />
                        {daysToTarget} days left
                      </Badge>
                    )}
                    {daysToTarget !== null && daysToTarget <= 0 && !isEligible && (
                      <Badge variant="destructive" className="ml-2 text-xs px-1.5 py-0">
                        Overdue
                      </Badge>
                    )}
                  </>
                ) : (
                  <span>{gift.target_duration_months} month target</span>
                )}
              </div>
            )}

            {/* Cash Equivalent */}
            {gift.cash_equivalent && (
              <div className="text-xs text-muted-foreground mt-1">
                Worth: ₹{gift.cash_equivalent.toLocaleString()}
              </div>
            )}

            {/* Action Buttons */}
            <div className="mt-3 flex gap-2">
              {isSubscribed && canRedeem && onRedeem && (
                <Button 
                  size="sm" 
                  className="bg-green-600 hover:bg-green-700"
                  onClick={onRedeem}
                >
                  <CheckCircle className="h-4 w-4 mr-1" />
                  Redeem Now
                </Button>
              )}
              {!isSubscribed && onSubscribe && (
                <Button 
                  size="sm" 
                  variant={isEligible ? "default" : "outline"}
                  onClick={onSubscribe}
                  disabled={isSubscribing}
                >
                  {isEligible ? (
                    <>
                      <CheckCircle className="h-4 w-4 mr-1" />
                      Select & Redeem
                    </>
                  ) : (
                    <>
                      <Target className="h-4 w-4 mr-1" />
                      Set as Goal
                    </>
                  )}
                </Button>
              )}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

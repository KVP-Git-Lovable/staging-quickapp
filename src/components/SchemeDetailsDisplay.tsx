import React from 'react';
import { Badge } from '@/components/ui/badge';
import { Percent, DollarSign, Gift, Package, Users, Clock, Star, Tag, Calendar, CheckCircle } from 'lucide-react';

interface SchemeDetailsDisplayProps {
  scheme: any;
}

export const SchemeDetailsDisplay = ({ scheme }: SchemeDetailsDisplayProps) => {
  
  const getSchemeTypeIcon = (type: string) => {
    switch (type) {
      case 'percentage_discount': return <Percent size={14} className="text-green-600" />;
      case 'flat_discount': return <DollarSign size={14} className="text-blue-600" />;
      case 'buy_x_get_y_free': return <Gift size={14} className="text-purple-600" />;
      case 'bundle_combo': return <Package size={14} className="text-orange-600" />;
      case 'tiered_discount': return <Users size={14} className="text-indigo-600" />;
      case 'time_based_offer': return <Clock size={14} className="text-red-600" />;
      case 'first_order_discount': return <Star size={14} className="text-yellow-600" />;
      case 'category_wide_discount': return <Tag size={14} className="text-teal-600" />;
      default: return <Percent size={14} />;
    }
  };

  const getSchemeTypeLabel = (type: string) => {
    switch (type) {
      case 'percentage_discount': return 'Percentage Discount';
      case 'flat_discount': return 'Flat Discount';
      case 'buy_x_get_y_free': return 'BOGO';
      case 'bundle_combo': return 'Bundle/Combo';
      case 'tiered_discount': return 'Tiered Discount';
      case 'time_based_offer': return 'Time-Based';
      case 'first_order_discount': return 'First Order';
      case 'category_wide_discount': return 'Category-Wide';
      default: return type.replace('_', ' ');
    }
  };

  const formatDate = (date: string) => {
    if (!date) return 'No limit';
    return new Date(date).toLocaleDateString();
  };

  const formatUnit = (unit: string | undefined) => {
    if (!unit) return '';
    const unitMap: Record<string, string> = {
      'kg': 'KG',
      'grams': 'g',
      'pieces': 'pcs',
      'liters': 'L',
      'ml': 'ml',
      'units': 'units'
    };
    return unitMap[unit?.toLowerCase()] || unit?.toUpperCase() || '';
  };

  const getConditionText = () => {
    switch (scheme.scheme_type) {
      case 'percentage_discount':
      case 'flat_discount':
        const condUnit = formatUnit(scheme.condition_unit);
        return `Min quantity: ${scheme.condition_quantity}${condUnit ? ` ${condUnit}` : ''}`;
      
      case 'buy_x_get_y_free':
        const buyUnit = formatUnit(scheme.buy_quantity_unit);
        return `Buy ${scheme.buy_quantity}${buyUnit ? ` ${buyUnit}` : ''}`;
      
      case 'bundle_combo':
        const bundleCount = scheme.bundle_product_ids?.length || 0;
        return `Bundle of ${bundleCount} products`;
      
      case 'tiered_discount':
        const tierCount = scheme.tier_data?.length || 0;
        return `${tierCount} discount tiers`;
      
      case 'time_based_offer':
        const validityText = scheme.validity_days ? `${scheme.validity_days} days` : 'Duration limited';
        return `Valid for ${validityText}`;
      
      case 'first_order_discount':
        return scheme.is_first_order_only ? 'First order only' : 'New customers';
      
      case 'category_wide_discount':
        const minOrderText = scheme.min_order_value > 0 ? `Min order: ₹${scheme.min_order_value}` : 'No minimum';
        return minOrderText;
      
      default:
        return 'Special offer';
    }
  };

  const getBenefitText = () => {
    switch (scheme.scheme_type) {
      case 'percentage_discount':
      case 'time_based_offer':
      case 'first_order_discount':
      case 'category_wide_discount':
        return `${scheme.discount_percentage}% off`;
      
      case 'flat_discount':
        return `₹${scheme.discount_amount} off`;
      
      case 'buy_x_get_y_free': {
        const freeUnit = formatUnit(scheme.free_quantity_unit);
        if (scheme.free_product_selection_mode === 'user_choice') {
          const poolSize = (scheme.free_target_product_ids?.length || 0) + (scheme.free_target_other_product_ids?.length || 0);
          return `Get ${scheme.free_quantity}${freeUnit ? ` ${freeUnit}` : ''} free — buyer chooses 1 of ${poolSize} option${poolSize === 1 ? '' : 's'}`;
        }
        const freeProductName = scheme.free_product_source === 'other'
          ? (scheme.other_free_product?.name || 'item(s)')
          : (scheme.free_product?.name || scheme.free_product_name || 'item(s)');
        return `Get ${scheme.free_quantity}${freeUnit ? ` ${freeUnit}` : ''} ${freeProductName} free`;
      }
      
      case 'bundle_combo':
        if (scheme.bundle_discount_percentage > 0) {
          return `${scheme.bundle_discount_percentage}% off bundle`;
        } else if (scheme.bundle_discount_amount > 0) {
          return `₹${scheme.bundle_discount_amount} off bundle`;
        }
        return 'Bundle discount';
      
      case 'tiered_discount':
        const maxDiscount = Math.max(...(scheme.tier_data?.map((t: any) => t.discount_percentage) || [0]));
        return `Up to ${maxDiscount}% off`;
      
      default:
        return 'Special benefit';
    }
  };

  const isActive = () => {
    if (!scheme.is_active) return false;
    
    const now = new Date();
    const start = scheme.start_date ? new Date(scheme.start_date) : null;
    const end = scheme.end_date ? new Date(scheme.end_date) : null;
    
    if (start && now < start) return false;
    if (end && now > end) return false;
    
    return true;
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        {getSchemeTypeIcon(scheme.scheme_type)}
        <Badge 
          variant={isActive() ? 'default' : 'secondary'}
          className="capitalize"
        >
          {getSchemeTypeLabel(scheme.scheme_type)}
        </Badge>
        {isActive() && (
          <Badge variant="outline" className="text-green-600 border-green-600">
            <CheckCircle size={10} className="mr-1" />
            Active
          </Badge>
        )}
      </div>

      <div className="text-sm space-y-1">
        <div className="flex items-center gap-1 text-muted-foreground">
          <span className="font-medium">Condition:</span>
          <span>{getConditionText()}</span>
        </div>
        
        <div className="flex items-center gap-1 text-green-600">
          <span className="font-medium">Benefit:</span>
          <span>{getBenefitText()}</span>
        </div>

        {(scheme.start_date || scheme.end_date) && (
          <div className="flex items-center gap-1 text-muted-foreground">
            <Calendar size={12} />
            <span>{formatDate(scheme.start_date)} - {formatDate(scheme.end_date)}</span>
          </div>
        )}

        {scheme.scheme_type === 'tiered_discount' && scheme.tier_data?.length > 0 && (
          <div className="mt-2 space-y-1">
            <span className="text-xs font-medium text-muted-foreground">Tiers:</span>
            {scheme.tier_data.map((tier: any, index: number) => (
              <div key={index} className="text-xs bg-muted p-1 rounded flex justify-between">
                <span>{tier.min_qty}-{tier.max_qty} qty</span>
                <span className="text-green-600">{tier.discount_percentage}% off</span>
              </div>
            ))}
          </div>
        )}

        {scheme.scheme_type === 'bundle_combo' && scheme.bundle_product_ids?.length > 0 && (
          <div className="mt-2">
            <span className="text-xs font-medium text-muted-foreground">
              Bundle: {scheme.bundle_product_ids.length} products
            </span>
          </div>
        )}
      </div>
    </div>
  );
};
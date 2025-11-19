import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Badge } from './ui/badge';
import { CheckCircle, Tag, TrendingDown } from 'lucide-react';

interface JobPricingDisplayProps {
  pricing: {
    basePrice: number;
    finalPrice: number;
    discount: number;
    priceIncrease: number;
    appliedRules?: string[];
    campaignApplied?: string;
  };
  campaignName?: string;
  ruleName?: string;
}

const JobPricingDisplay: React.FC<JobPricingDisplayProps> = ({
  pricing,
  campaignName,
  ruleName
}) => {
  const hasDiscount = pricing.discount > 0;
  const hasPriceIncrease = pricing.priceIncrease > 0;

  return (
    <Card className="border-2 border-green-200 bg-green-50">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-green-800">
          <CheckCircle className="h-5 w-5" />
          Çmimi i Punës
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Price breakdown */}
        <div className="space-y-2">
          <div className="flex justify-between items-center">
            <span className="text-sm text-gray-600">Çmimi bazë:</span>
            <span className={`text-sm ${hasDiscount ? 'line-through text-gray-500' : 'font-medium'}`}>
              €{pricing.basePrice.toFixed(2)}
            </span>
          </div>

          {hasDiscount && (
            <div className="flex justify-between items-center text-green-600">
              <span className="text-sm flex items-center gap-1">
                <TrendingDown className="h-3 w-3" />
                Zbritje:
              </span>
              <span className="text-sm font-medium">-€{pricing.discount.toFixed(2)}</span>
            </div>
          )}

          {hasPriceIncrease && (
            <div className="flex justify-between items-center text-orange-600">
              <span className="text-sm">Shtesë çmimi:</span>
              <span className="text-sm font-medium">+€{pricing.priceIncrease.toFixed(2)}</span>
            </div>
          )}

          <hr className="my-2" />

          <div className="flex justify-between items-center">
            <span className="font-medium">Çmimi përfundimtar:</span>
            <span className="text-lg font-bold text-green-700">
              €{pricing.finalPrice.toFixed(2)}
            </span>
          </div>
        </div>

        {/* Applied promotions */}
        {(campaignName || ruleName) && (
          <div className="space-y-2">
            <p className="text-xs font-medium text-gray-700">Zbritjet e aplikuara:</p>
            {campaignName && (
              <Badge variant="secondary" className="bg-green-100 text-green-800">
                <Tag className="h-3 w-3 mr-1" />
                {campaignName}
              </Badge>
            )}
            {ruleName && (
              <Badge variant="outline" className="border-green-300 text-green-700">
                {ruleName}
              </Badge>
            )}
          </div>
        )}

        {/* Savings highlight */}
        {hasDiscount && (
          <div className="bg-green-100 p-3 rounded-lg text-center">
            <p className="text-sm font-medium text-green-800">
              🎉 Keni kursyer €{pricing.discount.toFixed(2)} me këtë postim!
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default JobPricingDisplay;
import React from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from './ui/card';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Check } from 'lucide-react';

interface PricingPlan {
  name: string;
  tagline: string;
  price: string;
  serviceFee: string;
  period: string;
  features: string[];
  buttonText: string;
  buttonVariant: "default" | "outline";
  highlighted?: boolean;
  badge?: string;
}

interface PricingSectionProps {
  plans?: PricingPlan[];
  className?: string;
}

const defaultPlans: PricingPlan[] = [
  {
    name: 'Bazë',
    tagline: 'Për të filluar',
    price: '28€',
    serviceFee: '7.99%',
    period: '28 ditë',
    buttonText: 'Fillo me këtë plan',
    buttonVariant: 'outline',
    features: [
      "Marketplace global i freelancer-ave të Advance",
      "Qasje në veçori të fuqizuara nga AI",
      "Mjete të bashkëpunimit dhe ndjekjes së projekteve",
      "Raportim standard",
      "Paguaj ndërsa puna përfundon",
      "30 ftesa për postim pune"
    ]
  },
  {
    name: 'Business Plus',
    tagline: 'Për rritje',
    price: '50€',
    serviceFee: '10%',
    period: '28 ditë',
    buttonText: 'Regjistrohu falas',
    buttonVariant: 'default',
    highlighted: true,
    badge: 'Rekomanduar',
    features: [
      "Çdo gjë në Bazë, plus",
      "Qasje e menjëhershme në 1% e talenteve më të mira",
      "Uma Recruiter",
      "Kontrollet e ekipit",
      "Raportim i avancuar",
      "Mbështetje prioritare 24/7",
      "Paguaj më vonë",
      "60 ftesa për postim pune",
      "15 mesazhe të drejtpërdrejta në ditë"
    ]
  }
];

const PricingSection: React.FC<PricingSectionProps> = ({
  plans = defaultPlans,
  className = ''
}) => {
  return (
    <div className={`w-full ${className}`}>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-6xl mx-auto">
        {plans.map((plan, index) => (
          <Card
            key={index}
            className={`relative transition-all duration-200 hover:shadow-lg ${
              plan.highlighted
                ? 'border-2 border-green-400 shadow-md bg-gradient-to-br from-green-50/30 to-white'
                : 'border hover:border-gray-300'
            }`}
          >
            {plan.badge && plan.highlighted && (
              <div className="absolute -top-3 left-1/2 transform -translate-x-1/2">
                <Badge className="bg-green-600 hover:bg-green-700 text-white px-4 py-1">
                  {plan.badge}
                </Badge>
              </div>
            )}

            <CardHeader className="pb-4 pt-8">
              <CardTitle className="text-2xl font-bold text-gray-900">
                {plan.name}
              </CardTitle>
              <CardDescription className="text-sm text-gray-600">
                {plan.tagline}
              </CardDescription>

              <div className="mt-4">
                <div className="flex items-baseline gap-2">
                  <span className="text-3xl font-bold text-gray-900">
                    {plan.serviceFee}
                  </span>
                  <span className="text-sm text-gray-600">
                    Service fee
                  </span>
                </div>
              </div>

              <Button
                variant={plan.buttonVariant}
                size="lg"
                className={`w-full mt-6 ${
                  plan.highlighted
                    ? 'bg-green-600 hover:bg-green-700 text-white'
                    : 'border-green-600 text-green-700 hover:bg-green-50'
                }`}
              >
                {plan.buttonText}
              </Button>
            </CardHeader>

            <CardContent className="pt-6 border-t">
              <h4 className="font-semibold text-sm text-gray-900 mb-4">
                {index === 0 ? `Plani ${plan.name} përfshin:` : `${plan.features[0]}`}
              </h4>

              <ul className="space-y-3">
                {plan.features.slice(index === 0 ? 0 : 1).map((feature, idx) => (
                  <li key={idx} className="flex items-start gap-3">
                    <div className="flex-shrink-0 mt-0.5">
                      <Check className="h-4 w-4 text-green-600" />
                    </div>
                    <span className="text-sm text-gray-700 leading-relaxed">
                      {feature}
                    </span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        ))}
      </div>

      
    </div>
  );
};

export default PricingSection;

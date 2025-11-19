import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Badge } from '../components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../components/ui/dialog';
import { AlertTriangle, TrendingUp, TrendingDown, DollarSign, Users, Zap, Edit } from 'lucide-react';
import { useToast } from '../components/ui/use-toast';
import { adminApi } from '../lib/api';

interface Campaign {
  _id: string;
  name: string;
  type: string;
  status: string;
  parameters: {
    discount: number;
    discountType: string;
    targetAudience: string;
    maxUses: number;
    currentUses: number;
  };
  results: {
    revenue: number;
    conversions: number;
    roi: number;
  };
  schedule: {
    startDate: string;
    endDate: string;
  };
}

interface PricingRule {
  _id: string;
  name: string;
  category: string;
  rules: {
    multiplier: number;
    basePrice: number;
  };
  isActive: boolean;
  usage: {
    timesApplied: number;
    averageImpact: number;
  };
  revenue: {
    totalGenerated: number;
    jobsAffected: number;
  };
}

interface Analytics {
  summary: {
    totalRevenue: number;
    totalJobs: number;
    totalNewEmployers: number;
    avgJobPrice: number;
    avgConversionRate: number;
  };
  topIndustries: Array<{
    _id: string;
    totalRevenue: number;
    totalJobs: number;
  }>;
}

const BusinessDashboard: React.FC = () => {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [pricingRules, setPricingRules] = useState<PricingRule[]>([]);
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('overview');
  const { toast } = useToast();

  // Campaign form state
  const [newCampaign, setNewCampaign] = useState({
    name: '',
    type: 'flash_sale',
    description: '',
    discount: 10,
    discountType: 'percentage',
    targetAudience: 'all',
    duration: 24,
    maxUses: 100,
    startDate: new Date().toISOString().slice(0, 16),
    endDate: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 16)
  });

  // Pricing rule form state
  const [newPricingRule, setNewPricingRule] = useState({
    name: '',
    category: 'industry',
    description: '',
    basePrice: 50,
    multiplier: 1.2,
    conditions: [{
      field: 'industry',
      operator: 'equals',
      value: ''
    }]
  });

  const [emergencyControls, setEmergencyControls] = useState({
    maintenanceMode: false,
    pauseNewJobs: false,
    forceLogout: false
  });

  const [editingCampaign, setEditingCampaign] = useState<Campaign | null>(null);
  const [editCampaignData, setEditCampaignData] = useState({
    name: '',
    discount: 10,
    maxUses: 100,
    startDate: '',
    endDate: ''
  });

  useEffect(() => {
    loadDashboardData();
  }, []);

  const loadDashboardData = async () => {
    try {
      setLoading(true);
      const [campaignsRes, rulesRes, analyticsRes] = await Promise.all([
        adminApi.getBusinessCampaigns(),
        adminApi.getPricingRules(),
        adminApi.getBusinessAnalytics('month')
      ]);

      setCampaigns(campaignsRes.data.campaigns || []);
      setPricingRules(rulesRes.data.rules || []);
      setAnalytics(analyticsRes.data || null);
    } catch (error) {
      console.error('Error loading dashboard data:', error);
      toast({
        title: "Gabim në ngarkim",
        description: "Nuk mund të ngarkoheshin të dhënat e panelit",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const createCampaign = async () => {
    try {
      const response = await adminApi.createCampaign({
        ...newCampaign,
        schedule: {
          startDate: new Date(newCampaign.startDate),
          endDate: new Date(newCampaign.endDate)
        },
        parameters: {
          discount: newCampaign.discount,
          discountType: newCampaign.discountType,
          targetAudience: newCampaign.targetAudience,
          duration: newCampaign.duration,
          maxUses: newCampaign.maxUses
        }
      });

      setCampaigns(prev => [...prev, response.data.campaign]);
      setNewCampaign({
        name: '',
        type: 'flash_sale',
        description: '',
        discount: 10,
        discountType: 'percentage',
        targetAudience: 'all',
        duration: 24,
        maxUses: 100,
        startDate: new Date().toISOString().slice(0, 16),
        endDate: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 16)
      });

      toast({
        title: "Sukses",
        description: "Kampanja u krijua me sukses"
      });
    } catch (error) {
      console.error('Error creating campaign:', error);
      toast({
        title: "Gabim",
        description: "Nuk mund të krijohet kampanja",
        variant: "destructive"
      });
    }
  };

  const toggleCampaign = async (campaignId: string, action: 'activate' | 'pause') => {
    try {
      await adminApi.updateCampaign(campaignId, action);
      await loadDashboardData();
      toast({
        title: "Sukses",
        description: `Kampanja u ${action === 'activate' ? 'aktivizua' : 'pauzua'} me sukses`
      });
    } catch (error) {
      console.error(`Error ${action}ing campaign:`, error);
      toast({
        title: "Gabim",
        description: `Nuk mund të ${action === 'activate' ? 'aktivizohet' : 'pauzohet'} kampanja`,
        variant: "destructive"
      });
    }
  };

  const createPricingRule = async () => {
    try {
      const response = await adminApi.createPricingRule({
        ...newPricingRule,
        rules: {
          basePrice: newPricingRule.basePrice,
          multiplier: newPricingRule.multiplier,
          fixedAdjustment: 0,
          conditions: newPricingRule.conditions
        }
      });

      setPricingRules(prev => [...prev, response.data.rule]);
      setNewPricingRule({
        name: '',
        category: 'industry',
        description: '',
        basePrice: 50,
        multiplier: 1.2,
        conditions: [{
          field: 'industry',
          operator: 'equals',
          value: ''
        }]
      });

      toast({
        title: "Sukses",
        description: "Rregulli i çmimit u krijua me sukses"
      });
    } catch (error) {
      console.error('Error creating pricing rule:', error);
      toast({
        title: "Gabim",
        description: "Nuk mund të krijohet rregulli i çmimit",
        variant: "destructive"
      });
    }
  };

  const executeEmergencyControl = async (action: string) => {
    try {
      await adminApi.executeEmergencyControl(action);
      toast({
        title: "Sukses",
        description: `Kontrolli emergjent "${action}" u ekzekutua me sukses`
      });
      await loadDashboardData(); // Refresh data
    } catch (error) {
      console.error('Error executing emergency control:', error);
      toast({
        title: "Gabim",
        description: "Nuk mund të ekzekutohet kontrolli emergjent",
        variant: "destructive"
      });
    }
  };

  const updateCampaign = async () => {
    if (!editingCampaign) return;

    try {
      await adminApi.updateCampaignData(editingCampaign._id, {
        name: editCampaignData.name,
        parameters: {
          ...editingCampaign.parameters,
          discount: editCampaignData.discount,
          maxUses: editCampaignData.maxUses
        },
        schedule: {
          startDate: new Date(editCampaignData.startDate),
          endDate: new Date(editCampaignData.endDate)
        }
      });

      setEditingCampaign(null);
      await loadDashboardData();
      toast({
        title: "Sukses",
        description: "Kampanja u përditësua me sukses"
      });
    } catch (error) {
      console.error('Error updating campaign:', error);
      toast({
        title: "Gabim",
        description: "Nuk mund të përditësohet kampanja",
        variant: "destructive"
      });
    }
  };

  if (loading) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="flex items-center justify-center h-64">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
            <p className="mt-4 text-gray-600">Duke ngarkuar panelin e biznesit...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Paneli i Biznesit</h1>
          <p className="text-gray-600 mt-2">Menaxhoni platformën dhe rritni të ardhurat</p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={() => executeEmergencyControl('pause_platform')}
            className="text-orange-600 border-orange-600 hover:bg-orange-50"
          >
            <AlertTriangle className="h-4 w-4 mr-2" />
            Pauzë Emergjente
          </Button>
          <Button onClick={loadDashboardData}>
            Rifresko
          </Button>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-6">
          <TabsTrigger value="overview">Pasqyra</TabsTrigger>
          <TabsTrigger value="campaigns">Kampanja</TabsTrigger>
          <TabsTrigger value="pricing">Çmimet</TabsTrigger>
          <TabsTrigger value="analytics">Analitika</TabsTrigger>
          <TabsTrigger value="whitelist">Miq</TabsTrigger>
          <TabsTrigger value="emergency">Kontrollet</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Të Ardhura Totale</CardTitle>
                <DollarSign className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  €{analytics?.summary?.totalRevenue?.toFixed(2) || '0.00'}
                </div>
                <p className="text-xs text-muted-foreground">Muaji aktual</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Punë të Postuara</CardTitle>
                <TrendingUp className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {analytics?.summary?.totalJobs || 0}
                </div>
                <p className="text-xs text-muted-foreground">Muaji aktual</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Punëdhënës të Rinj</CardTitle>
                <Users className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {analytics?.summary?.totalNewEmployers || 0}
                </div>
                <p className="text-xs text-muted-foreground">Muaji aktual</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Çmimi Mesatar</CardTitle>
                <TrendingUp className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  €{analytics?.summary?.avgJobPrice?.toFixed(2) || '0.00'}
                </div>
                <p className="text-xs text-muted-foreground">Për punë</p>
              </CardContent>
            </Card>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle>Kampanja Aktive</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {campaigns.filter(c => c.status === 'active').slice(0, 3).map(campaign => (
                    <div key={campaign._id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                      <div>
                        <p className="font-medium">{campaign.name}</p>
                        <p className="text-sm text-gray-600">
                          {campaign.parameters.discount}% zbritje - {campaign.parameters.currentUses}/{campaign.parameters.maxUses} përdorime
                        </p>
                      </div>
                      <Badge variant={campaign.status === 'active' ? 'default' : 'secondary'}>
                        {campaign.status}
                      </Badge>
                    </div>
                  ))}
                  {campaigns.filter(c => c.status === 'active').length === 0 && (
                    <p className="text-gray-500 text-center py-4">Nuk ka kampanja aktive</p>
                  )}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Industritë Kryesore</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {analytics?.topIndustries?.slice(0, 5).map((industry, index) => (
                    <div key={industry._id} className="flex items-center justify-between">
                      <div>
                        <p className="font-medium">{industry._id}</p>
                        <p className="text-sm text-gray-600">{industry.totalJobs} punë</p>
                      </div>
                      <div className="text-right">
                        <p className="font-medium">€{industry.totalRevenue.toFixed(2)}</p>
                      </div>
                    </div>
                  )) || (
                    <p className="text-gray-500 text-center py-4">Nuk ka të dhëna industrie</p>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="campaigns" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <Card className="lg:col-span-1">
              <CardHeader>
                <CardTitle>Krijo Kampanjë të Re</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label htmlFor="campaign-name">Emri i Kampanjës</Label>
                  <Input
                    id="campaign-name"
                    value={newCampaign.name}
                    onChange={(e) => setNewCampaign({ ...newCampaign, name: e.target.value })}
                    placeholder="Flash Sale Vere 2024"
                  />
                </div>

                <div>
                  <Label htmlFor="campaign-type">Lloji</Label>
                  <Select value={newCampaign.type} onValueChange={(value) => setNewCampaign({ ...newCampaign, type: value })}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="flash_sale">Flash Sale</SelectItem>
                      <SelectItem value="referral">Referim</SelectItem>
                      <SelectItem value="new_user_bonus">Bonus Përdorues i Ri</SelectItem>
                      <SelectItem value="seasonal">Sezonal</SelectItem>
                      <SelectItem value="industry_specific">Industri Specifike</SelectItem>
                      <SelectItem value="bulk_discount">Zbritje Masive</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label htmlFor="discount">Zbritja</Label>
                    <Input
                      id="discount"
                      type="number"
                      value={newCampaign.discount}
                      onChange={(e) => setNewCampaign({ ...newCampaign, discount: parseInt(e.target.value) })}
                      min="0"
                      max="90"
                    />
                  </div>
                  <div>
                    <Label htmlFor="discount-type">Lloji</Label>
                    <Select value={newCampaign.discountType} onValueChange={(value) => setNewCampaign({ ...newCampaign, discountType: value })}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="percentage">Përqindje</SelectItem>
                        <SelectItem value="fixed_amount">Shumë Fikse</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div>
                  <Label htmlFor="target-audience">Audienca</Label>
                  <Select value={newCampaign.targetAudience} onValueChange={(value) => setNewCampaign({ ...newCampaign, targetAudience: value })}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Të Gjithë</SelectItem>
                      <SelectItem value="new_employers">Punëdhënës të Rinj</SelectItem>
                      <SelectItem value="returning_employers">Punëdhënës Kthyes</SelectItem>
                      <SelectItem value="enterprise">Enterprise</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label htmlFor="max-uses">Përdorime Maksimale</Label>
                  <Input
                    id="max-uses"
                    type="number"
                    value={newCampaign.maxUses}
                    onChange={(e) => setNewCampaign({ ...newCampaign, maxUses: parseInt(e.target.value) })}
                    min="1"
                  />
                </div>

                <Button onClick={createCampaign} className="w-full">
                  Krijo Kampanjën
                </Button>
              </CardContent>
            </Card>

            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle>Kampanja Ekzistuese</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {campaigns.map(campaign => (
                    <div key={campaign._id} className="border rounded-lg p-4">
                      <div className="flex items-center justify-between mb-2">
                        <h3 className="font-medium">{campaign.name}</h3>
                        <div className="flex gap-2">
                          <Badge variant={campaign.status === 'active' ? 'default' : 'secondary'}>
                            {campaign.status}
                          </Badge>
                          <Button size="sm" variant="outline" onClick={() => {
                            setEditingCampaign(campaign);
                            setEditCampaignData({
                              name: campaign.name,
                              discount: campaign.parameters.discount,
                              maxUses: campaign.parameters.maxUses,
                              startDate: new Date(campaign.schedule.startDate).toISOString().slice(0, 16),
                              endDate: new Date(campaign.schedule.endDate).toISOString().slice(0, 16)
                            });
                          }}>
                            <Edit className="h-3 w-3 mr-1" />
                            Ndrysho
                          </Button>
                          {campaign.status === 'active' ? (
                            <Button size="sm" variant="outline" onClick={() => toggleCampaign(campaign._id, 'pause')}>
                              Pauzë
                            </Button>
                          ) : (
                            <Button size="sm" onClick={() => toggleCampaign(campaign._id, 'activate')}>
                              Aktivizo
                            </Button>
                          )}
                        </div>
                      </div>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                        <div>
                          <p className="text-gray-600">Zbritja</p>
                          <p className="font-medium">{campaign.parameters.discount}%</p>
                        </div>
                        <div>
                          <p className="text-gray-600">Përdorime</p>
                          <p className="font-medium">{campaign.parameters.currentUses}/{campaign.parameters.maxUses}</p>
                        </div>
                        <div>
                          <p className="text-gray-600">Të Ardhura</p>
                          <p className="font-medium">€{campaign.results.revenue.toFixed(2)}</p>
                        </div>
                        <div>
                          <p className="text-gray-600">ROI</p>
                          <p className="font-medium">{campaign.results.roi.toFixed(1)}%</p>
                        </div>
                      </div>
                    </div>
                  ))}
                  {campaigns.length === 0 && (
                    <p className="text-gray-500 text-center py-8">Nuk ka kampanja të krijuara ende</p>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="pricing" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <Card className="lg:col-span-1">
              <CardHeader>
                <CardTitle>Rregulli i Ri i Çmimit</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label htmlFor="rule-name">Emri i Rregullit</Label>
                  <Input
                    id="rule-name"
                    value={newPricingRule.name}
                    onChange={(e) => setNewPricingRule({ ...newPricingRule, name: e.target.value })}
                    placeholder="Çmim Special për IT"
                  />
                </div>

                <div>
                  <Label htmlFor="rule-category">Kategoria</Label>
                  <Select value={newPricingRule.category} onValueChange={(value) => setNewPricingRule({ ...newPricingRule, category: value })}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="industry">Industri</SelectItem>
                      <SelectItem value="location">Lokacion</SelectItem>
                      <SelectItem value="demand_based">Bazuar në Kërkesë</SelectItem>
                      <SelectItem value="company_size">Madhësia e Kompanisë</SelectItem>
                      <SelectItem value="seasonal">Sezonal</SelectItem>
                      <SelectItem value="time_based">Bazuar në Kohë</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label htmlFor="base-price">Çmimi Bazë</Label>
                    <Input
                      id="base-price"
                      type="number"
                      value={newPricingRule.basePrice}
                      onChange={(e) => setNewPricingRule({ ...newPricingRule, basePrice: parseFloat(e.target.value) })}
                      min="0"
                      step="0.01"
                    />
                  </div>
                  <div>
                    <Label htmlFor="multiplier">Shumëzuesi</Label>
                    <Input
                      id="multiplier"
                      type="number"
                      value={newPricingRule.multiplier}
                      onChange={(e) => setNewPricingRule({ ...newPricingRule, multiplier: parseFloat(e.target.value) })}
                      min="0.1"
                      max="10"
                      step="0.1"
                    />
                  </div>
                </div>

                <div>
                  <Label htmlFor="condition-value">Vlera e Kushtit</Label>
                  <Input
                    id="condition-value"
                    value={newPricingRule.conditions[0].value}
                    onChange={(e) => setNewPricingRule({
                      ...newPricingRule,
                      conditions: [{ ...newPricingRule.conditions[0], value: e.target.value }]
                    })}
                    placeholder="p.sh: Teknologji Informacioni"
                  />
                </div>

                <Button onClick={createPricingRule} className="w-full">
                  Krijo Rregullin
                </Button>
              </CardContent>
            </Card>

            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle>Rregullat e Çmimeve</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {pricingRules.map(rule => (
                    <div key={rule._id} className="border rounded-lg p-4">
                      <div className="flex items-center justify-between mb-2">
                        <h3 className="font-medium">{rule.name}</h3>
                        <div className="flex gap-2">
                          <Badge variant={rule.isActive ? 'default' : 'secondary'}>
                            {rule.isActive ? 'Aktiv' : 'Joaktiv'}
                          </Badge>
                          <Badge variant="outline">{rule.category}</Badge>
                        </div>
                      </div>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                        <div>
                          <p className="text-gray-600">Çmimi Bazë</p>
                          <p className="font-medium">€{rule.rules.basePrice}</p>
                        </div>
                        <div>
                          <p className="text-gray-600">Shumëzuesi</p>
                          <p className="font-medium">{rule.rules.multiplier}x</p>
                        </div>
                        <div>
                          <p className="text-gray-600">Përdorime</p>
                          <p className="font-medium">{rule.usage.timesApplied}</p>
                        </div>
                        <div>
                          <p className="text-gray-600">Të Ardhura</p>
                          <p className="font-medium">€{rule.revenue.totalGenerated.toFixed(2)}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                  {pricingRules.length === 0 && (
                    <p className="text-gray-500 text-center py-8">Nuk ka rregulla çmimi të krijuara ende</p>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="analytics" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle>Analitika e Të Ardhurave</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="text-center p-4 bg-green-50 rounded-lg">
                      <p className="text-2xl font-bold text-green-600">
                        €{analytics?.summary?.totalRevenue?.toFixed(2) || '0.00'}
                      </p>
                      <p className="text-sm text-gray-600">Të Ardhura Totale</p>
                    </div>
                    <div className="text-center p-4 bg-blue-50 rounded-lg">
                      <p className="text-2xl font-bold text-blue-600">
                        {analytics?.summary?.avgConversionRate?.toFixed(1) || '0.0'}%
                      </p>
                      <p className="text-sm text-gray-600">Konvertimi</p>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <p className="text-sm font-medium">Performanca Muajore</p>
                    <div className="bg-gray-200 rounded-full h-2">
                      <div className="bg-blue-600 h-2 rounded-full" style={{ width: '75%' }}></div>
                    </div>
                    <p className="text-xs text-gray-600">75% e objektivit muajor</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Industritë më të Suksesshme</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {analytics?.topIndustries?.slice(0, 5).map((industry, index) => (
                    <div key={industry._id} className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center text-sm font-medium">
                          {index + 1}
                        </div>
                        <div>
                          <p className="font-medium">{industry._id}</p>
                          <p className="text-sm text-gray-600">{industry.totalJobs} punë</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="font-medium">€{industry.totalRevenue.toFixed(2)}</p>
                      </div>
                    </div>
                  )) || (
                    <p className="text-gray-500 text-center py-4">Nuk ka të dhëna industrie</p>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="whitelist" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <Card className="lg:col-span-1">
              <CardHeader>
                <CardTitle>Shto në Listën e Miqve</CardTitle>
                <CardDescription>Punëdhënës që postojnë FALAS</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label htmlFor="employer-search">Kërko Punëdhënës</Label>
                  <Input
                    id="employer-search"
                    placeholder="Email ose emri i kompanisë..."
                    onChange={(e) => console.log('Search:', e.target.value)}
                  />
                </div>
                <div>
                  <Label htmlFor="whitelist-reason">Arsyeja</Label>
                  <Input
                    id="whitelist-reason"
                    placeholder="Miku, partner, sponsor..."
                  />
                </div>
                <Button className="w-full" disabled>
                  Zgjedh Punëdhënës
                </Button>
              </CardContent>
            </Card>

            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle>Miqtë - Postojnë FALAS</CardTitle>
                <CardDescription>Punëdhënës që kanë privilegje postimi falas</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="text-center py-8 text-gray-500">
                    <Users className="h-12 w-12 mx-auto mb-4 text-gray-400" />
                    <p>Nuk ka miq të shtuar ende</p>
                    <p className="text-sm">Përdor formën në të majtë për të shtuar miq</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="emergency" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-orange-500" />
                Kontrollet Emergjente
              </CardTitle>
              <CardDescription>
                Përdorni këto kontrolle vetëm në situata emergjente. Veprimet janë të pakthyeshme.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                <Button
                  variant="destructive"
                  onClick={() => executeEmergencyControl('freeze_posting')}
                  className="h-20 flex-col"
                >
                  <Zap className="h-6 w-6 mb-2" />
                  Ndalë Postimet
                </Button>

                <Button
                  variant="destructive"
                  onClick={() => executeEmergencyControl('pause_all_campaigns')}
                  className="h-20 flex-col"
                >
                  <DollarSign className="h-6 w-6 mb-2" />
                  Pauzë Kampanja
                </Button>

                <Button
                  variant="destructive"
                  onClick={() => executeEmergencyControl('reset_pricing')}
                  className="h-20 flex-col"
                >
                  <Users className="h-6 w-6 mb-2" />
                  Reset Çmimet
                </Button>

                <Button
                  variant="outline"
                  onClick={() => executeEmergencyControl('reactivate_campaigns')}
                  className="h-20 flex-col border-green-600 text-green-600 hover:bg-green-50"
                >
                  <Zap className="h-6 w-6 mb-2" />
                  Aktivizo Kampanja
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Edit Campaign Modal */}
      <Dialog open={!!editingCampaign} onOpenChange={() => setEditingCampaign(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Ndrysho Kampanjën</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="edit-name">Emri i Kampanjës</Label>
              <Input
                id="edit-name"
                value={editCampaignData.name}
                onChange={(e) => setEditCampaignData({ ...editCampaignData, name: e.target.value })}
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label htmlFor="edit-discount">Zbritja (%)</Label>
                <Input
                  id="edit-discount"
                  type="number"
                  value={editCampaignData.discount}
                  onChange={(e) => setEditCampaignData({ ...editCampaignData, discount: parseInt(e.target.value) })}
                  min="0"
                  max="90"
                />
              </div>
              <div>
                <Label htmlFor="edit-maxUses">Përdorime Maks</Label>
                <Input
                  id="edit-maxUses"
                  type="number"
                  value={editCampaignData.maxUses}
                  onChange={(e) => setEditCampaignData({ ...editCampaignData, maxUses: parseInt(e.target.value) })}
                  min="1"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label htmlFor="edit-startDate">Data Fillimit</Label>
                <Input
                  id="edit-startDate"
                  type="datetime-local"
                  value={editCampaignData.startDate}
                  onChange={(e) => setEditCampaignData({ ...editCampaignData, startDate: e.target.value })}
                />
              </div>
              <div>
                <Label htmlFor="edit-endDate">Data Mbarimit</Label>
                <Input
                  id="edit-endDate"
                  type="datetime-local"
                  value={editCampaignData.endDate}
                  onChange={(e) => setEditCampaignData({ ...editCampaignData, endDate: e.target.value })}
                />
              </div>
            </div>

            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setEditingCampaign(null)}>
                Anulo
              </Button>
              <Button onClick={updateCampaign}>
                Ruaj Ndryshimet
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default BusinessDashboard;
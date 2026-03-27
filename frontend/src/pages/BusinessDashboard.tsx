import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Badge } from '../components/ui/badge';
import { DollarSign, Edit, Loader2, Save, CheckCircle, Briefcase, Star, Users } from 'lucide-react';
import { useToast } from '../components/ui/use-toast';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

interface PricingData {
  standardPosting: number;
  promotedPosting: number;
  candidateViewing: number;
  paymentEnabled: boolean;
}

const BusinessDashboard: React.FC = () => {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [pricing, setPricing] = useState<PricingData>({
    standardPosting: 28,
    promotedPosting: 45,
    candidateViewing: 15,
    paymentEnabled: false
  });
  const [editMode, setEditMode] = useState(false);
  const [editValues, setEditValues] = useState<PricingData>({
    standardPosting: 28,
    promotedPosting: 45,
    candidateViewing: 15,
    paymentEnabled: false
  });

  useEffect(() => {
    loadPricing();
  }, []);

  const getAuthHeaders = (): Record<string, string> => {
    const token = localStorage.getItem('authToken');
    const headers: Record<string, string> = {
      'Content-Type': 'application/json'
    };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    return headers;
  };

  const loadPricing = async () => {
    try {
      setLoading(true);
      const response = await fetch(`${API_BASE_URL}/configuration/pricing`, {
        headers: getAuthHeaders()
      });
      const data = await response.json();

      if (data.success && data.data?.pricing) {
        setPricing(data.data.pricing);
        setEditValues(data.data.pricing);
      }
    } catch (error) {
      console.error('Error loading pricing:', error);
      toast({
        title: 'Gabim',
        description: 'Nuk mund të ngarkohen çmimet',
        variant: 'destructive'
      });
    } finally {
      setLoading(false);
    }
  };

  const savePricing = async () => {
    try {
      setSaving(true);
      const response = await fetch(`${API_BASE_URL}/configuration/pricing`, {
        method: 'PUT',
        headers: getAuthHeaders(),
        body: JSON.stringify(editValues)
      });
      const data = await response.json();

      if (data.success) {
        setPricing({ ...editValues });
        setEditMode(false);
        toast({
          title: 'Sukses',
          description: 'Çmimet u përditësuan me sukses'
        });
      } else {
        throw new Error(data.message);
      }
    } catch (error: any) {
      toast({
        title: 'Gabim',
        description: error.message || 'Nuk mund të ruhen çmimet',
        variant: 'destructive'
      });
    } finally {
      setSaving(false);
    }
  };

  const cancelEdit = () => {
    setEditValues({ ...pricing });
    setEditMode(false);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold">Çmimet e Platformës</h2>
          <p className="text-sm text-muted-foreground">Menaxhoni çmimet për shërbimet e advance.al</p>
        </div>
        {!editMode ? (
          <Button onClick={() => setEditMode(true)} size="sm">
            <Edit className="h-4 w-4 mr-2" />
            Ndrysho çmimet
          </Button>
        ) : (
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={cancelEdit} disabled={saving}>
              Anulo
            </Button>
            <Button size="sm" onClick={savePricing} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
              Ruaj
            </Button>
          </div>
        )}
      </div>

      {/* Payment Status */}
      <Card>
        <CardContent className="py-4">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <DollarSign className="h-5 w-5 text-muted-foreground flex-shrink-0" />
              <div>
                <p className="font-medium text-sm">Sistemi i Pagesave</p>
                <p className="text-xs text-muted-foreground">
                  {pricing.paymentEnabled
                    ? 'Pagesat janë aktive — punëdhënësit paguajnë për të postuar punë'
                    : 'Pagesat janë çaktivizuar — të gjithë punëdhënësit postojnë falas'}
                </p>
              </div>
            </div>
            {editMode ? (
              <Button
                variant={editValues.paymentEnabled ? 'default' : 'outline'}
                size="sm"
                onClick={() => setEditValues({ ...editValues, paymentEnabled: !editValues.paymentEnabled })}
              >
                {editValues.paymentEnabled ? 'Aktiv' : 'Joaktiv'}
              </Button>
            ) : (
              <Badge variant={pricing.paymentEnabled ? 'default' : 'secondary'}>
                {pricing.paymentEnabled ? 'Aktiv' : 'Joaktiv'}
              </Badge>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Pricing Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {/* Standard Posting */}
        <Card className="border-2 border-gray-200">
          <CardHeader className="text-center pb-2 px-3 pt-4">
            <div className="mx-auto w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center mb-1">
              <Briefcase className="h-5 w-5 text-blue-600" />
            </div>
            <CardTitle className="text-base">Postim Standart</CardTitle>
            <p className="text-xs text-muted-foreground">Postim normal i një pune</p>
          </CardHeader>
          <CardContent className="text-center space-y-3 px-3 pb-4">
            {editMode ? (
              <div className="space-y-1">
                <Label className="text-xs">Çmimi (EUR)</Label>
                <Input
                  type="number"
                  min={0}
                  max={1000}
                  value={editValues.standardPosting}
                  onChange={(e) => setEditValues({ ...editValues, standardPosting: Number(e.target.value) })}
                  className="text-center text-xl font-bold"
                />
              </div>
            ) : (
              <div className="text-3xl font-bold text-blue-600">
                €{pricing.standardPosting}
              </div>
            )}
            <div className="text-xs text-muted-foreground space-y-0.5">
              <p>Postim aktiv për 21 ditë</p>
              <p>Shfaqe në listën e punëve</p>
              <p>Aplikime të pakufizuara</p>
              <p>Menaxhim aplikimesh</p>
            </div>
          </CardContent>
        </Card>

        {/* Promoted Posting */}
        <Card className="border-2 border-yellow-400 relative">
          <div className="absolute -top-3 left-1/2 transform -translate-x-1/2">
            <Badge className="bg-yellow-400 text-yellow-900 hover:bg-yellow-400 text-xs">
              <Star className="h-3 w-3 mr-1" />
              Popullar
            </Badge>
          </div>
          <CardHeader className="text-center pb-2 px-3 pt-5">
            <div className="mx-auto w-10 h-10 bg-yellow-100 rounded-full flex items-center justify-center mb-1">
              <Star className="h-5 w-5 text-yellow-600" />
            </div>
            <CardTitle className="text-base">Postim i Promovuar</CardTitle>
            <p className="text-xs text-muted-foreground">Pozicion prioritar në listë</p>
          </CardHeader>
          <CardContent className="text-center space-y-3 px-3 pb-4">
            {editMode ? (
              <div className="space-y-1">
                <Label className="text-xs">Çmimi (EUR)</Label>
                <Input
                  type="number"
                  min={0}
                  max={1000}
                  value={editValues.promotedPosting}
                  onChange={(e) => setEditValues({ ...editValues, promotedPosting: Number(e.target.value) })}
                  className="text-center text-xl font-bold"
                />
              </div>
            ) : (
              <div className="text-3xl font-bold text-yellow-600">
                €{pricing.promotedPosting}
              </div>
            )}
            <div className="text-xs text-muted-foreground space-y-0.5">
              <p>Gjithçka nga paketa Standarte</p>
              <p>Pozicion prioritar në listë</p>
              <p>Distinktiv &quot;E PROMOVUAR&quot;</p>
              <p>3× më shumë dukshmëri</p>
            </div>
          </CardContent>
        </Card>

        {/* Candidate Viewing */}
        <Card className="border-2 border-purple-200">
          <CardHeader className="text-center pb-2 px-3 pt-4">
            <div className="mx-auto w-10 h-10 bg-purple-100 rounded-full flex items-center justify-center mb-1">
              <Users className="h-5 w-5 text-purple-600" />
            </div>
            <CardTitle className="text-base">Shikimi i Kandidatëve</CardTitle>
            <p className="text-xs text-muted-foreground">Qasje në profilet e kandidatëve</p>
          </CardHeader>
          <CardContent className="text-center space-y-3 px-3 pb-4">
            {editMode ? (
              <div className="space-y-1">
                <Label className="text-xs">Çmimi (EUR)</Label>
                <Input
                  type="number"
                  min={0}
                  max={1000}
                  value={editValues.candidateViewing}
                  onChange={(e) => setEditValues({ ...editValues, candidateViewing: Number(e.target.value) })}
                  className="text-center text-xl font-bold"
                />
              </div>
            ) : (
              <div className="text-3xl font-bold text-purple-600">
                €{pricing.candidateViewing}
              </div>
            )}
            <div className="text-xs text-muted-foreground space-y-0.5">
              <p>Shiko profilet e kandidatëve</p>
              <p>Shkarko CV-të e tyre</p>
              <p>Kontakto kandidatët direkt</p>
              <p>Filtrim i avancuar</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Info Note */}
      <Card className="bg-blue-50 border-blue-200">
        <CardContent className="py-3">
          <div className="flex items-start gap-2">
            <CheckCircle className="h-4 w-4 text-blue-600 mt-0.5 flex-shrink-0" />
            <p className="text-xs text-blue-700">
              Çmimet ndikojnë punët e reja që postohen nga punëdhënësit. Punët ekzistuese nuk ndikohen.
              Kur sistemi i pagesave është joaktiv, të gjithë punëdhënësit e verifikuar postojnë falas.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default BusinessDashboard;

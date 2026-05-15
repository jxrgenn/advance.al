import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import Navigation from "@/components/Navigation";
import Footer from "@/components/Footer";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { jobsApi, paymentsApi, Job } from "@/lib/api";
import { CreditCard, Loader2, ArrowLeft, Sparkles, Clock, Check, Star } from "lucide-react";

type Tier = 'standard' | 'promoted';

const STANDARD_PRICE = 35;
const PROMOTED_PRICE = 49;

const PaymentJobPosting = () => {
  const { jobId } = useParams<{ jobId: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [job, setJob] = useState<Job | null>(null);
  const [loading, setLoading] = useState(true);
  const [cancelling, setCancelling] = useState(false);
  const [paying, setPaying] = useState(false);
  const [selectedTier, setSelectedTier] = useState<Tier>('standard');

  useEffect(() => {
    if (!jobId) {
      navigate('/employer-dashboard');
      return;
    }
    jobsApi.getJob(jobId)
      .then((r) => {
        if (r.success && r.data?.job) {
          setJob(r.data.job);
          // Pre-select tier if the job already has one (e.g. retrying payment).
          const existing = (r.data.job as any)?.tier;
          if (existing === 'premium') setSelectedTier('promoted');
        } else {
          navigate('/employer-dashboard');
        }
      })
      .catch(() => navigate('/employer-dashboard'))
      .finally(() => setLoading(false));
  }, [jobId, navigate]);

  const price = selectedTier === 'promoted' ? PROMOTED_PRICE : STANDARD_PRICE;

  const handlePay = async () => {
    if (!jobId || paying) return;
    try {
      setPaying(true);
      const r = await paymentsApi.initiatePaysera(jobId, selectedTier);
      if (r.success && r.data?.redirectUrl) {
        window.location.href = r.data.redirectUrl;
        return;
      }
      toast({
        title: 'Gabim',
        description: r.message || 'Nuk mund të inicializohet pagesa. Provoni përsëri.',
        variant: 'destructive',
      });
    } catch (err: any) {
      toast({
        title: 'Gabim',
        description: err?.message || 'Nuk mund të inicializohet pagesa.',
        variant: 'destructive',
      });
    } finally {
      setPaying(false);
    }
  };

  const handleCancel = async () => {
    if (!jobId || cancelling) return;
    const ok = window.confirm('A jeni i sigurt që doni ta anuloni këtë postim? Puna nuk do të publikohet.');
    if (!ok) return;
    try {
      setCancelling(true);
      await jobsApi.deleteJob(jobId);
      toast({ title: 'Postimi u anulua', description: 'Mund të krijoni një postim të ri kur jeni gati.' });
      navigate('/employer-dashboard');
    } catch {
      toast({ title: 'Gabim', description: 'Nuk mund të anulohet tani. Provoni përsëri.', variant: 'destructive' });
    } finally {
      setCancelling(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <Navigation />
        <div className="container py-12 flex items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      </div>
    );
  }

  if (!job) return null;

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Navigation />
      <main className="flex-1 container py-8">
        <div className="max-w-3xl mx-auto">
          <Button variant="ghost" onClick={() => navigate('/employer-dashboard')} className="mb-6">
            <ArrowLeft className="h-4 w-4 mr-2" /> Kthehu te paneli
          </Button>

          <Card className="border-2 border-primary/20">
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="bg-primary/10 p-3 rounded-full">
                  <CreditCard className="h-6 w-6 text-primary" />
                </div>
                <div>
                  <CardTitle className="text-2xl">Zgjidh paketën dhe paguaj</CardTitle>
                  <CardDescription>Puna publikohet menjëherë pas konfirmimit të pagesës</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="bg-muted/50 rounded-lg p-4">
                <p className="text-sm text-muted-foreground mb-1">Titulli i punës</p>
                <p className="font-semibold">{job.title}</p>
              </div>

              {/* Tier selector */}
              <div className="grid gap-4 sm:grid-cols-2">
                <TierCard
                  tier="standard"
                  selected={selectedTier === 'standard'}
                  onSelect={() => setSelectedTier('standard')}
                  title="Standart"
                  price={STANDARD_PRICE}
                  description="Postim i rregullt"
                  features={[
                    'Aktiv për 21 ditë',
                    'Renditje normale në listim',
                    'Aplikime të pakufizuara',
                    'Statistika bazë',
                  ]}
                />
                <TierCard
                  tier="promoted"
                  selected={selectedTier === 'promoted'}
                  onSelect={() => setSelectedTier('promoted')}
                  title="I Promovuar"
                  price={PROMOTED_PRICE}
                  description="Dukshmëri më e madhe"
                  badge="I rekomanduar"
                  features={[
                    'Aktiv për 21 ditë',
                    'Pozicion prioritar në listim',
                    'Shenjë premium në kartelë',
                    'Statistika të plota',
                  ]}
                />
              </div>

              <div className="flex items-start gap-3 text-sm bg-blue-50 border border-blue-200 rounded-lg p-3">
                <Clock className="h-4 w-4 text-blue-600 mt-0.5 flex-shrink-0" />
                <p className="text-blue-800">
                  Puna mbetet e ruajtur dhe e padukshme deri sa pagesa të kompletohet.
                  Pas pagesës do të ridrejtoheni automatikisht.
                </p>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <Button onClick={handlePay} size="lg" className="w-full" disabled={paying}>
                  {paying ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  ) : (
                    <Sparkles className="h-4 w-4 mr-2" />
                  )}
                  Paguaj €{price}
                </Button>
                <Button onClick={handleCancel} variant="outline" size="lg" className="w-full" disabled={cancelling}>
                  {cancelling ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                  Anulo postimin
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </main>
      <Footer />
    </div>
  );
};

type TierCardProps = {
  tier: Tier;
  selected: boolean;
  onSelect: () => void;
  title: string;
  price: number;
  description: string;
  features: string[];
  badge?: string;
};

const TierCard = ({ selected, onSelect, title, price, description, features, badge }: TierCardProps) => (
  <button
    type="button"
    onClick={onSelect}
    className={`relative text-left rounded-lg border-2 p-4 transition-all ${
      selected
        ? 'border-primary bg-primary/5 ring-2 ring-primary/20'
        : 'border-muted hover:border-muted-foreground/30'
    }`}
  >
    {badge && (
      <span className="absolute -top-2 right-3 bg-primary text-primary-foreground text-xs font-semibold px-2 py-0.5 rounded-full flex items-center gap-1">
        <Star className="h-3 w-3" /> {badge}
      </span>
    )}
    <div className="flex items-start justify-between mb-2">
      <div>
        <p className="font-semibold text-lg">{title}</p>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
      <p className="text-2xl font-bold">€{price}</p>
    </div>
    <ul className="space-y-1.5 mt-3">
      {features.map((f) => (
        <li key={f} className="flex items-start gap-2 text-sm">
          <Check className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" />
          <span>{f}</span>
        </li>
      ))}
    </ul>
    <div className="mt-3 flex items-center gap-2 text-sm">
      <span
        className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${
          selected ? 'border-primary bg-primary' : 'border-muted-foreground/40'
        }`}
      >
        {selected && <span className="w-1.5 h-1.5 rounded-full bg-white" />}
      </span>
      <span className={selected ? 'text-primary font-medium' : 'text-muted-foreground'}>
        {selected ? 'I zgjedhur' : 'Zgjidh'}
      </span>
    </div>
  </button>
);

export default PaymentJobPosting;

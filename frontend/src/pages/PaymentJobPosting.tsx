import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import Navigation from "@/components/Navigation";
import Footer from "@/components/Footer";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { jobsApi, Job } from "@/lib/api";
import { CreditCard, Loader2, ArrowLeft, Sparkles, Clock } from "lucide-react";

const PaymentJobPosting = () => {
  const { jobId } = useParams<{ jobId: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [job, setJob] = useState<Job | null>(null);
  const [loading, setLoading] = useState(true);
  const [cancelling, setCancelling] = useState(false);

  useEffect(() => {
    if (!jobId) {
      navigate('/employer-dashboard');
      return;
    }
    jobsApi.getJob(jobId)
      .then((r) => {
        if (r.success && r.data?.job) setJob(r.data.job);
        else navigate('/employer-dashboard');
      })
      .catch(() => navigate('/employer-dashboard'))
      .finally(() => setLoading(false));
  }, [jobId, navigate]);

  // Pricing — kept as constants here so the page renders cleanly even if the
  // SystemConfiguration fetch fails. Defaults match models/SystemConfiguration.js.
  const standardPrice = 35;
  const promotedPrice = 49;
  const tier: 'standard' | 'promoted' = (job as any)?.tier === 'premium' ? 'promoted' : 'standard';
  const price = tier === 'promoted' ? promotedPrice : standardPrice;

  const handlePay = () => {
    toast({
      title: 'Paysera vjen së shpejti',
      description: 'Integrimi i pagesave Paysera është në përgatitje. Ju do të njoftoheni sapo të jetë gati.',
    });
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
        <div className="max-w-2xl mx-auto">
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
                  <CardTitle className="text-2xl">Plotëso pagesën</CardTitle>
                  <CardDescription>Puna do të publikohet menjëherë pas pagesës</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="bg-muted/50 rounded-lg p-4">
                <p className="text-sm text-muted-foreground mb-1">Titulli i punës</p>
                <p className="font-semibold">{job.title}</p>
              </div>

              <div className="flex items-center justify-between border-y py-4">
                <div>
                  <p className="font-medium">{tier === 'promoted' ? 'Postim i Promovuar' : 'Postim Standart'}</p>
                  <p className="text-sm text-muted-foreground">
                    {tier === 'promoted'
                      ? 'Dukshmëri e shtuar — shfaqet në krye të listës'
                      : 'Listim i rregullt për 21 ditë'}
                  </p>
                </div>
                <p className="text-3xl font-bold">€{price}</p>
              </div>

              <div className="flex items-start gap-3 text-sm bg-blue-50 border border-blue-200 rounded-lg p-3">
                <Clock className="h-4 w-4 text-blue-600 mt-0.5 flex-shrink-0" />
                <p className="text-blue-800">
                  Puna mbetet e ruajtur dhe e padukshme deri sa pagesa të kompletohet.
                  Mund të paguani më vonë nga paneli i punëdhënësit.
                </p>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <Button onClick={handlePay} size="lg" className="w-full">
                  <Sparkles className="h-4 w-4 mr-2" />
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

export default PaymentJobPosting;

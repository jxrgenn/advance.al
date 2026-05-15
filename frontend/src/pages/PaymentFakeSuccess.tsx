import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import Navigation from "@/components/Navigation";
import Footer from "@/components/Footer";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { paymentsApi } from "@/lib/api";
import { CheckCircle2, Loader2, LayoutDashboard } from "lucide-react";

/**
 * /payment/fake-success — DEV ONLY landing page used when Paysera is not
 * configured. The initiate endpoint returns a relative URL pointing here;
 * we call the server-side fake-success route to flip the job to active,
 * then show a confirmation. Production servers reject the fake-success
 * route, so this page is only ever reachable in dev/test.
 */
const PaymentFakeSuccess = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [params] = useSearchParams();
  const jobId = params.get('jobId');
  const [state, setState] = useState<'pending' | 'done' | 'error'>('pending');
  const [errorMsg, setErrorMsg] = useState<string>('');

  useEffect(() => {
    let cancelled = false;
    if (!jobId) {
      setState('error');
      setErrorMsg('jobId mungon në URL');
      return;
    }

    (async () => {
      try {
        const r = await paymentsApi.fakeSuccess(jobId);
        if (cancelled) return;
        if (r.success) {
          setState('done');
        } else {
          setState('error');
          setErrorMsg(r.message || 'Aktivizimi dështoi');
          toast({
            title: 'Gabim',
            description: r.message || 'Aktivizimi dështoi',
            variant: 'destructive',
          });
        }
      } catch (err: any) {
        if (cancelled) return;
        setState('error');
        setErrorMsg(err?.message || 'Gabim i papritur');
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [jobId, toast]);

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Navigation />
      <main className="flex-1 container py-12">
        <div className="max-w-xl mx-auto">
          <Card className="border-2 border-green-200">
            <CardContent className="pt-8 pb-6 text-center space-y-4">
              {state === 'pending' && (
                <>
                  <div className="bg-muted p-4 rounded-full inline-flex">
                    <Loader2 className="h-12 w-12 text-primary animate-spin" />
                  </div>
                  <h1 className="text-2xl font-bold">Duke përpunuar pagesën...</h1>
                  <p className="text-muted-foreground text-sm">
                    Mënyra DEV — Paysera nuk është konfiguruar. Po simulohet pagesa e suksesshme.
                  </p>
                </>
              )}
              {state === 'done' && (
                <>
                  <div className="bg-green-100 p-4 rounded-full inline-flex">
                    <CheckCircle2 className="h-12 w-12 text-green-600" />
                  </div>
                  <h1 className="text-2xl font-bold">Pagesa (DEV) u krye!</h1>
                  <p className="text-muted-foreground">
                    Puna është publikuar. Në prodhim ky hap do të kalojë përmes Paysera.
                  </p>
                  <div className="pt-4">
                    <Button onClick={() => navigate('/employer-dashboard')} className="w-full sm:w-auto">
                      <LayoutDashboard className="h-4 w-4 mr-2" />
                      Te paneli
                    </Button>
                  </div>
                </>
              )}
              {state === 'error' && (
                <>
                  <h1 className="text-2xl font-bold text-destructive">Gabim</h1>
                  <p className="text-muted-foreground">{errorMsg}</p>
                  <div className="pt-4">
                    <Button onClick={() => navigate('/employer-dashboard')} variant="outline">
                      Kthehu te paneli
                    </Button>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </div>
      </main>
      <Footer />
    </div>
  );
};

export default PaymentFakeSuccess;

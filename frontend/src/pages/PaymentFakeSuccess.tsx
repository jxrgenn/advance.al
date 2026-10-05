import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import Navigation from "@/components/Navigation";
import Footer from "@/components/Footer";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { paymentsApi } from "@/lib/api";
import { Loader2 } from "lucide-react";

/**
 * /payment/fake-success?order=<orderId> — DEV ONLY. When no card provider is
 * configured (and the server allows dev-fake), checkout returns this page
 * instead of a Stripe URL. We complete the dev-fake order server-side
 * (same fulfilment path as a real payment) and hand over to the real
 * success page, which verifies the order like it would for Stripe.
 * Production servers answer 404 to the fake-complete call.
 */
const PaymentFakeSuccess = () => {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const orderId = params.get("order");
  const [errorMsg, setErrorMsg] = useState<string>(orderId ? "" : "Porosia mungon në URL.");

  useEffect(() => {
    if (!orderId) return;
    let cancelled = false;
    paymentsApi.fakeComplete(orderId)
      .then(() => {
        if (!cancelled) navigate(`/payment/success?order=${encodeURIComponent(orderId)}`, { replace: true });
      })
      .catch((err: unknown) => {
        if (!cancelled) setErrorMsg(err instanceof Error ? err.message : "Aktivizimi dështoi");
      });
    return () => { cancelled = true; };
  }, [orderId, navigate]);

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Navigation />
      <main className="flex-1 container py-12">
        <div className="max-w-xl mx-auto">
          <Card className="border-2 border-primary/20">
            <CardContent className="pt-8 pb-6 text-center space-y-4">
              {!errorMsg ? (
                <>
                  <div className="bg-muted p-4 rounded-full inline-flex">
                    <Loader2 className="h-12 w-12 text-primary animate-spin" />
                  </div>
                  <h1 className="text-2xl font-bold">Duke përpunuar pagesën (DEV)…</h1>
                  <p className="text-muted-foreground text-sm">
                    Mënyra DEV — asnjë ofrues pagesash nuk është konfiguruar. Po simulohet pagesa e suksesshme.
                  </p>
                </>
              ) : (
                <>
                  <h1 className="text-2xl font-bold text-destructive">Gabim</h1>
                  <p className="text-muted-foreground">{errorMsg}</p>
                  <Button onClick={() => navigate("/employer-dashboard")} variant="outline">
                    Kthehu te paneli
                  </Button>
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

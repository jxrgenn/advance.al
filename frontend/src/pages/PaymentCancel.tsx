import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import Navigation from "@/components/Navigation";
import SEO from "@/components/SEO";
import Footer from "@/components/Footer";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { paymentsApi, PaymentOrderView } from "@/lib/api";
import { LayoutDashboard, RefreshCw, XCircle } from "lucide-react";

/**
 * /payment/cancel?order=<orderId> — Stripe sends the customer here when they
 * leave the checkout. The job stays unpublished (pending_payment for a new
 * post; expired/closed for a renewal). "Provo përsëri" goes back to the tier
 * picker for the same job; if the order was paid after all (rare race), we
 * hand over to the success page instead.
 */
const PaymentCancel = () => {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const orderId = params.get("order");
  const [order, setOrder] = useState<PaymentOrderView | null>(null);

  useEffect(() => {
    if (!orderId) return;
    let cancelled = false;
    paymentsApi.getOrder(orderId)
      .then((r) => {
        if (cancelled || !r.success || !r.data) return;
        if (r.data.status === "paid") {
          navigate(`/payment/success?order=${encodeURIComponent(orderId)}`, { replace: true });
          return;
        }
        setOrder(r.data);
      })
      .catch(() => { /* fall back to the dashboard link */ });
    return () => { cancelled = true; };
  }, [orderId, navigate]);

  const retryPath = order
    ? `/payment/job/${order.jobId}${order.purpose === "job_renewal" ? "?purpose=job_renewal" : ""}`
    : null;

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <SEO title="Pagesa u anulua" path="/payment/cancel" noindex />
      <Navigation />
      <main className="flex-1 container py-12">
        <div className="max-w-xl mx-auto">
          <Card className="border-2 border-amber-200">
            <CardContent className="pt-8 pb-6 text-center space-y-4">
              <div className="bg-amber-100 p-4 rounded-full inline-flex">
                <XCircle className="h-12 w-12 text-amber-600" />
              </div>
              <h1 className="text-2xl font-bold">Pagesa u anulua</h1>
              <p className="text-muted-foreground">
                Pagesa nuk u kompletua dhe nuk ju është tërhequr asnjë shumë.
                {order?.jobTitle ? <> Puna <strong>“{order.jobTitle}”</strong> nuk është publikuar.</> : " Puna nuk është publikuar."}{" "}
                Mund ta riprovoni në çdo kohë.
              </p>
              <div className="grid gap-3 sm:grid-cols-2 pt-4">
                {retryPath && (
                  <Button onClick={() => navigate(retryPath)} className="w-full">
                    <RefreshCw className="h-4 w-4 mr-2" />
                    Provo përsëri
                  </Button>
                )}
                <Button
                  onClick={() => navigate("/employer-dashboard")}
                  variant={retryPath ? "outline" : "default"}
                  className={retryPath ? "w-full" : "w-full sm:col-span-2"}
                >
                  <LayoutDashboard className="h-4 w-4 mr-2" />
                  Kthehu te paneli
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

export default PaymentCancel;

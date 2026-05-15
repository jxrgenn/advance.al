import { useNavigate } from "react-router-dom";
import Navigation from "@/components/Navigation";
import Footer from "@/components/Footer";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { XCircle, LayoutDashboard } from "lucide-react";

/**
 * /payment/cancel — Paysera redirects the user here when they cancel the
 * checkout (or close the tab and come back). The job stays in
 * pending_payment state on the server. User can retry from the dashboard.
 */
const PaymentCancel = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-background flex flex-col">
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
                Pagesa nuk u kompletua. Puna juaj është ende në pritje dhe nuk është
                publikuar. Mund ta riprovoni në çdo kohë nga paneli i punëdhënësit.
              </p>
              <div className="pt-4">
                <Button onClick={() => navigate('/employer-dashboard')} className="w-full sm:w-auto">
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

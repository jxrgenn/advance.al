import { useNavigate } from "react-router-dom";
import Navigation from "@/components/Navigation";
import Footer from "@/components/Footer";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CheckCircle2, LayoutDashboard, Briefcase } from "lucide-react";

/**
 * /payment/success — Paysera redirects the user here after a successful
 * checkout. The server-to-server callback to /api/payments/paysera/callback
 * has already flipped the job from pending_payment → active by the time the
 * user lands here, so we don't make an API call. We just confirm visually.
 */
const PaymentSuccess = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Navigation />
      <main className="flex-1 container py-12">
        <div className="max-w-xl mx-auto">
          <Card className="border-2 border-green-200">
            <CardContent className="pt-8 pb-6 text-center space-y-4">
              <div className="bg-green-100 p-4 rounded-full inline-flex">
                <CheckCircle2 className="h-12 w-12 text-green-600" />
              </div>
              <h1 className="text-2xl font-bold">Pagesa u krye me sukses!</h1>
              <p className="text-muted-foreground">
                Faleminderit. Puna juaj është publikuar dhe është tashmë e dukshme
                për kandidatët. Mund ta menaxhoni nga paneli juaj.
              </p>
              <div className="grid gap-3 sm:grid-cols-2 pt-4">
                <Button onClick={() => navigate('/employer-dashboard')} className="w-full">
                  <LayoutDashboard className="h-4 w-4 mr-2" />
                  Te paneli
                </Button>
                <Button onClick={() => navigate('/jobs')} variant="outline" className="w-full">
                  <Briefcase className="h-4 w-4 mr-2" />
                  Shiko punët
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

export default PaymentSuccess;

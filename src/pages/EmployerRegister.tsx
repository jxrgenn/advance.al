import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import Navigation from "@/components/Navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Building, Mail, Lock, MapPin, Users, CreditCard } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const EmployerRegister = () => {
  const [isLoading, setIsLoading] = useState(false);
  const [step, setStep] = useState(1);
  const navigate = useNavigate();
  const { toast } = useToast();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    
    // Simulate API call
    setTimeout(() => {
      setIsLoading(false);
      toast({
        title: "Mirësevini në PunaShqip!",
        description: "Llogaria juaj u krijua me sukses. Mund të filloni të postoni vende pune.",
      });
      navigate('/employer-dashboard');
    }, 1500);
  };

  const nextStep = () => {
    if (step < 3) setStep(step + 1);
  };

  const prevStep = () => {
    if (step > 1) setStep(step - 1);
  };

  return (
    <div className="min-h-screen bg-background">
      <Navigation />
      
      <div className="container flex items-center justify-center min-h-[calc(100vh-4rem)] py-8">
        <div className="w-full max-w-2xl">
          <Card>
            <CardHeader className="text-center">
              <CardTitle className="text-2xl">Regjistro Kompaniën</CardTitle>
              <CardDescription>
                Hapi {step} nga 3 - {step === 1 ? 'Informacioni Bazë' : step === 2 ? 'Detajet e Kompanisë' : 'Metoda e Pagesës'}
              </CardDescription>
              <div className="w-full max-w-xs mx-auto bg-secondary rounded-full h-2 mt-4">
                <div 
                  className="bg-primary h-2 rounded-full transition-all duration-300"
                  style={{ width: `${(step / 3) * 100}%` }}
                ></div>
              </div>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-6">
                {step === 1 && (
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="company-name">Emri i Kompanisë *</Label>
                      <div className="relative">
                        <Building className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input 
                          id="company-name" 
                          placeholder="Tech Innovations AL"
                          className="pl-10"
                          required 
                        />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="company-email">Email i Kompanisë *</Label>
                      <div className="relative">
                        <Mail className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input 
                          id="company-email" 
                          type="email" 
                          placeholder="hr@kompania.com"
                          className="pl-10"
                          required 
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="password">Fjalëkalimi *</Label>
                        <div className="relative">
                          <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                          <Input 
                            id="password" 
                            type="password"
                            className="pl-10"
                            required 
                          />
                        </div>
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="confirm-password">Konfirmo Fjalëkalimin *</Label>
                        <div className="relative">
                          <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                          <Input 
                            id="confirm-password" 
                            type="password"
                            className="pl-10"
                            required 
                          />
                        </div>
                      </div>
                    </div>

                    <Button type="button" onClick={nextStep} className="w-full">
                      Vazhdo
                    </Button>
                  </div>
                )}

                {step === 2 && (
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="location">Vendndodhja *</Label>
                      <div className="relative">
                        <MapPin className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input 
                          id="location" 
                          placeholder="Tiranë, Shqipëri"
                          className="pl-10"
                          required 
                        />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="company-size">Madhësia e Kompanisë</Label>
                      <div className="relative">
                        <Users className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <select className="w-full pl-10 pr-3 py-2 border border-input bg-background rounded-md">
                          <option>1-10 punonjës</option>
                          <option>11-50 punonjës</option>
                          <option>51-200 punonjës</option>
                          <option>200+ punonjës</option>
                        </select>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="description">Përshkrimi i Kompanisë</Label>
                      <Textarea
                        id="description"
                        placeholder="Shkruaj një përshkrim të shkurtër për kompaniën tuaj..."
                        rows={4}
                      />
                    </div>

                    <div className="flex gap-3">
                      <Button type="button" variant="outline" onClick={prevStep} className="flex-1">
                        Kthehu Mbrapa
                      </Button>
                      <Button type="button" onClick={nextStep} className="flex-1">
                        Vazhdo
                      </Button>
                    </div>
                  </div>
                )}

                {step === 3 && (
                  <div className="space-y-6">
                    <div className="text-center space-y-2">
                      <h3 className="text-lg font-semibold text-foreground">Zgjedh Planin</h3>
                      <p className="text-muted-foreground">
                        Posto punët e para falas dhe paguaj vetëm kur ke nevojë
                      </p>
                    </div>

                    <div className="grid gap-4">
                      <Card className="border-primary bg-light-blue/20">
                        <CardContent className="p-6">
                          <div className="flex items-center justify-between mb-4">
                            <div>
                              <h4 className="font-semibold text-foreground">Plan Bazë</h4>
                              <p className="text-sm text-muted-foreground">Perfekt për të filluar</p>
                            </div>
                            <div className="text-right">
                              <span className="text-2xl font-bold text-primary">€5</span>
                              <span className="text-muted-foreground">/punë</span>
                            </div>
                          </div>
                          <ul className="text-sm space-y-2 text-muted-foreground">
                            <li>✓ 1 punë falas për të testuar</li>
                            <li>✓ Aplikues të pafund</li>
                            <li>✓ Dashboard i thjeshtë</li>
                            <li>✓ Mbështetje me email</li>
                          </ul>
                        </CardContent>
                      </Card>
                    </div>

                    <div className="space-y-4">
                      <div className="space-y-2">
                        <Label>Metoda e Pagesës (Demo)</Label>
                        <div className="relative">
                          <CreditCard className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                          <Input 
                            placeholder="**** **** **** 1234"
                            className="pl-10"
                            disabled
                          />
                        </div>
                        <p className="text-xs text-muted-foreground">
                          * Kjo është vetëm demo. Nuk do të ngarkohesh ende.
                        </p>
                      </div>

                      <div className="flex gap-3">
                        <Button type="button" variant="outline" onClick={prevStep} className="flex-1">
                          Kthehu Mbrapa
                        </Button>
                        <Button type="submit" disabled={isLoading} className="flex-1">
                          {isLoading ? "Duke krijuar llogarinë..." : "Fillo me Plan Bazë"}
                        </Button>
                      </div>
                    </div>
                  </div>
                )}
              </form>

              <div className="mt-6 text-center text-sm">
                <span className="text-muted-foreground">Ke tashmë llogari? </span>
                <Link to="/login" className="text-primary hover:underline">
                  Kyçu këtu
                </Link>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default EmployerRegister;
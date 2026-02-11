import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import Navigation from "@/components/Navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Building, Mail, Lock, MapPin, Users, CreditCard, Briefcase } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";

const INDUSTRIES = [
  'Teknologji Informacioni',
  'Financë dhe Bankë',
  'Shëndetësi',
  'Arsim',
  'Ndërtim',
  'Tregti',
  'Turizëm dhe Hotelieri',
  'Transport dhe Logjistikë',
  'Prodhim',
  'Media dhe Komunikim',
  'Juridik',
  'Konsulencë',
  'Bujqësi',
  'Energji',
  'Tjetër',
];

const EmployerRegister = () => {
  const [isLoading, setIsLoading] = useState(false);
  const [step, setStep] = useState(1);
  const navigate = useNavigate();
  const { toast } = useToast();
  const { register } = useAuth();

  // Form state — all fields controlled
  const [companyName, setCompanyName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [location, setLocation] = useState('');
  const [companySize, setCompanySize] = useState('1-10 punonjës');
  const [industry, setIndustry] = useState('');
  const [description, setDescription] = useState('');

  const validateStep1 = (): string | null => {
    if (!companyName.trim()) return 'Emri i kompanisë është i detyrueshëm';
    if (!email.trim()) return 'Email-i është i detyrueshëm';
    if (!/\S+@\S+\.\S+/.test(email)) return 'Email-i nuk është i vlefshëm';
    if (password.length < 6) return 'Fjalëkalimi duhet të ketë të paktën 6 karaktere';
    if (password !== confirmPassword) return 'Fjalëkalimet nuk përputhen';
    return null;
  };

  const validateStep2 = (): string | null => {
    if (!location.trim()) return 'Vendndodhja është e detyrueshme';
    if (!industry) return 'Sektori i kompanisë është i detyrueshëm';
    return null;
  };

  const nextStep = () => {
    if (step === 1) {
      const error = validateStep1();
      if (error) {
        toast({ title: 'Gabim', description: error, variant: 'destructive' });
        return;
      }
    }
    if (step === 2) {
      const error = validateStep2();
      if (error) {
        toast({ title: 'Gabim', description: error, variant: 'destructive' });
        return;
      }
    }
    if (step < 3) setStep(step + 1);
  };

  const prevStep = () => {
    if (step > 1) setStep(step - 1);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      await register({
        email: email.trim(),
        password,
        userType: 'employer',
        firstName: companyName.trim(),
        lastName: '-',
        city: location.trim(),
        companyName: companyName.trim(),
        industry,
        companySize,
      });
      toast({
        title: 'Mirësevini në PunaShqip!',
        description: 'Llogaria juaj u krijua me sukses. Mund të filloni të postoni vende pune.',
      });
      navigate('/employer-dashboard');
    } catch (error: any) {
      toast({
        title: 'Gabim në regjistrim',
        description: error?.message || 'Ndodhi një gabim. Ju lutemi provoni përsëri.',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
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
                          value={companyName}
                          onChange={(e) => setCompanyName(e.target.value)}
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
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
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
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
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
                            value={confirmPassword}
                            onChange={(e) => setConfirmPassword(e.target.value)}
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
                          value={location}
                          onChange={(e) => setLocation(e.target.value)}
                          required
                        />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="industry">Sektori *</Label>
                      <div className="relative">
                        <Briefcase className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                        <select
                          id="industry"
                          className="w-full pl-10 pr-3 py-2 border border-input bg-background rounded-md text-sm"
                          value={industry}
                          onChange={(e) => setIndustry(e.target.value)}
                          required
                        >
                          <option value="">Zgjidh sektorin...</option>
                          {INDUSTRIES.map((ind) => (
                            <option key={ind} value={ind}>{ind}</option>
                          ))}
                        </select>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="company-size">Madhësia e Kompanisë</Label>
                      <div className="relative">
                        <Users className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                        <select
                          id="company-size"
                          className="w-full pl-10 pr-3 py-2 border border-input bg-background rounded-md text-sm"
                          value={companySize}
                          onChange={(e) => setCompanySize(e.target.value)}
                        >
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
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
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

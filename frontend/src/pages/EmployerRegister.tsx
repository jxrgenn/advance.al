import { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import Navigation from "@/components/Navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Building, Mail, Lock, MapPin, Users, CreditCard, Briefcase, Eye, EyeOff, RefreshCw } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { authApi } from "@/lib/api";

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
  'Marketing dhe Reklamim',
  'Tjetër',
];

const EmployerRegister = () => {
  const [isLoading, setIsLoading] = useState(false);
  const [step, setStep] = useState(1);
  const [showPassword, setShowPassword] = useState(false);
  const [verificationOpen, setVerificationOpen] = useState(false);
  const [verificationCode, setVerificationCode] = useState('');
  const [verificationEmail, setVerificationEmail] = useState('');
  const [verificationLoading, setVerificationLoading] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);
  const navigate = useNavigate();
  const { toast } = useToast();
  const { register, user } = useAuth();

  // Resend cooldown timer
  useEffect(() => {
    if (resendCooldown > 0) {
      const timer = setTimeout(() => setResendCooldown(resendCooldown - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [resendCooldown]);

  // Redirect authenticated users
  useEffect(() => {
    if (user) {
      navigate(user.userType === 'employer' ? '/employer-dashboard' : '/', { replace: true });
    }
  }, [user, navigate]);

  // Form state — all fields controlled
  const [companyName, setCompanyName] = useState('');
  const [contactFirstName, setContactFirstName] = useState('');
  const [contactLastName, setContactLastName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [location, setLocation] = useState('');
  const [companySize, setCompanySize] = useState('1-10');
  const [industry, setIndustry] = useState('');
  const [customIndustry, setCustomIndustry] = useState('');
  const [description, setDescription] = useState('');

  const validateStep1 = (): string | null => {
    if (!companyName.trim()) return 'Emri i kompanisë është i detyrueshëm';
    if (!contactFirstName.trim()) return 'Emri i personit të kontaktit është i detyrueshëm';
    if (!contactLastName.trim()) return 'Mbiemri i personit të kontaktit është i detyrueshëm';
    if (!email.trim()) return 'Email-i është i detyrueshëm';
    if (!/\S+@\S+\.\S+/.test(email)) return 'Email-i nuk është i vlefshëm';
    if (password.length < 8) return 'Fjalëkalimi duhet të ketë të paktën 8 karaktere';
    if (password !== confirmPassword) return 'Fjalëkalimet nuk përputhen';
    return null;
  };

  const validateStep2 = (): string | null => {
    if (!location.trim()) return 'Vendndodhja është e detyrueshme';
    if (!industry) return 'Sektori i kompanisë është i detyrueshëm';
    if (industry === 'Tjetër' && !customIndustry.trim()) return 'Shkruani sektorin e kompanisë';
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

  const getRegistrationData = () => ({
    email: email.trim(),
    password,
    userType: 'employer' as const,
    firstName: contactFirstName.trim(),
    lastName: contactLastName.trim(),
    city: location.trim(),
    companyName: companyName.trim(),
    industry: industry === 'Tjetër' ? customIndustry.trim() : industry,
    companySize,
    description: description.trim() || undefined,
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      const response = await authApi.initiateRegistration(getRegistrationData());
      if (response.success) {
        setVerificationEmail(email.trim());
        setVerificationCode('');
        setVerificationOpen(true);
        setResendCooldown(60);
        toast({
          title: 'Kontrolloni email-in',
          description: `Kemi dërguar një kod verifikimi në ${email.trim()}`,
        });
      } else {
        throw new Error(response.message || 'Gabim gjatë dërgimit të kodit');
      }
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

  const handleVerifyCode = async () => {
    if (verificationCode.length !== 6) return;
    try {
      setVerificationLoading(true);
      await register(verificationEmail, verificationCode);
      setVerificationOpen(false);
      toast({
        title: 'Mirësevini në PunaShqip!',
        description: 'Llogaria juaj u krijua me sukses.',
      });
      navigate('/employer-dashboard');
    } catch (error: any) {
      toast({
        title: 'Gabim',
        description: error?.message || 'Kodi i gabuar. Provoni përsëri.',
        variant: 'destructive',
      });
    } finally {
      setVerificationLoading(false);
    }
  };

  const handleResendCode = async () => {
    if (resendCooldown > 0) return;
    try {
      await authApi.initiateRegistration(getRegistrationData());
      setResendCooldown(60);
      setVerificationCode('');
      toast({ title: 'Kodi u ridërgua', description: 'Kontrolloni email-in tuaj' });
    } catch (error: any) {
      toast({ title: 'Gabim', description: error?.message || 'Nuk mund të ridërgohet kodi', variant: 'destructive' });
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <Navigation />

      <div className="container flex items-center justify-center min-h-[calc(100vh-4rem)] py-8">
        <div className="w-full max-w-2xl">
          <Card className="border-2 border-blue-200">
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
                    <div className="relative">
                      <Building className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        id="company-name"
                        placeholder="Emri i Kompanisë *"
                        className="pl-10"
                        value={companyName}
                        onChange={(e) => setCompanyName(e.target.value)}
                        required
                      />
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <Input
                        id="contact-first-name"
                        placeholder="Emri i kontaktit *"
                        value={contactFirstName}
                        onChange={(e) => setContactFirstName(e.target.value)}
                        required
                      />
                      <Input
                        id="contact-last-name"
                        placeholder="Mbiemri i kontaktit *"
                        value={contactLastName}
                        onChange={(e) => setContactLastName(e.target.value)}
                        required
                      />
                    </div>

                    <div className="relative">
                      <Mail className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        id="company-email"
                        type="email"
                        placeholder="Email i kompanisë *"
                        className="pl-10"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        required
                      />
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="relative">
                        <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input
                          id="password"
                          type={showPassword ? "text" : "password"}
                          placeholder="Fjalëkalimi *"
                          className="pl-10 pr-10"
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          required
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword(!showPassword)}
                          className="absolute right-3 top-1/2 transform -translate-y-1/2 text-muted-foreground hover:text-foreground"
                          tabIndex={-1}
                        >
                          {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </button>
                      </div>
                      <div className="relative">
                        <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input
                          id="confirm-password"
                          type={showPassword ? "text" : "password"}
                          placeholder="Konfirmo fjalëkalimin *"
                          className="pl-10"
                          value={confirmPassword}
                          onChange={(e) => setConfirmPassword(e.target.value)}
                          required
                        />
                      </div>
                    </div>

                    <Button type="button" onClick={nextStep} className="w-full">
                      Vazhdo
                    </Button>
                  </div>
                )}

                {step === 2 && (
                  <div className="space-y-4">
                    <div className="relative">
                      <MapPin className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        id="location"
                        placeholder="Vendndodhja *"
                        className="pl-10"
                        value={location}
                        onChange={(e) => setLocation(e.target.value)}
                        required
                      />
                    </div>

                    <div className="relative">
                      <Briefcase className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                      <select
                        id="industry"
                        className="w-full pl-10 pr-3 py-2 border border-input bg-background rounded-md text-sm"
                        value={industry}
                        onChange={(e) => setIndustry(e.target.value)}
                        required
                      >
                        <option value="">Zgjidh sektorin *</option>
                        {INDUSTRIES.map((ind) => (
                          <option key={ind} value={ind}>{ind}</option>
                        ))}
                      </select>
                    </div>

                    {industry === 'Tjetër' && (
                      <div className="relative">
                        <Briefcase className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input
                          id="custom-industry"
                          placeholder="Shkruani sektorin e kompanisë *"
                          className="pl-10"
                          value={customIndustry}
                          onChange={(e) => setCustomIndustry(e.target.value)}
                          maxLength={50}
                          required
                        />
                      </div>
                    )}

                    <div className="relative">
                      <Users className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                      <select
                        id="company-size"
                        className="w-full pl-10 pr-3 py-2 border border-input bg-background rounded-md text-sm"
                        value={companySize}
                        onChange={(e) => setCompanySize(e.target.value)}
                      >
                        <option value="1-10">1-10 punonjës</option>
                        <option value="11-50">11-50 punonjës</option>
                        <option value="51-200">51-200 punonjës</option>
                        <option value="201-500">201-500 punonjës</option>
                        <option value="501+">501+ punonjës</option>
                      </select>
                    </div>

                    <Textarea
                      id="description"
                      placeholder="Përshkrimi i kompanisë (opsional)"
                      rows={4}
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                    />

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
                        <p className="text-sm text-muted-foreground">Metoda e Pagesës (Demo)</p>
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
      {/* Email Verification Overlay */}
      {verificationOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <Card className="w-full max-w-sm mx-4">
            <CardContent className="p-6 text-center space-y-4">
              <div className="mx-auto w-14 h-14 rounded-full bg-blue-100 flex items-center justify-center">
                <Mail className="w-6 h-6 text-blue-600" />
              </div>
              <h3 className="text-lg font-semibold">Verifikoni Email-in</h3>
              <p className="text-sm text-muted-foreground">
                Kemi dërguar një kod 6-shifror në{' '}
                <span className="font-semibold text-blue-600">{verificationEmail}</span>
              </p>
              <Input
                type="text"
                inputMode="numeric"
                maxLength={6}
                placeholder="000000"
                className="text-center text-2xl tracking-[0.5em] font-bold"
                value={verificationCode}
                onChange={(e) => {
                  const val = e.target.value.replace(/\D/g, '').slice(0, 6);
                  setVerificationCode(val);
                }}
                autoFocus
              />
              <Button
                className="w-full"
                onClick={handleVerifyCode}
                disabled={verificationCode.length !== 6 || verificationLoading}
              >
                {verificationLoading ? 'Duke verifikuar...' : 'Verifiko & Krijo Llogarinë'}
              </Button>
              <div className="flex items-center justify-center gap-2">
                <span className="text-xs text-muted-foreground">Nuk e morët kodin?</span>
                <button
                  className="text-xs text-blue-600 hover:underline disabled:text-gray-400 disabled:no-underline flex items-center gap-1"
                  onClick={handleResendCode}
                  disabled={resendCooldown > 0}
                >
                  <RefreshCw className="w-3 h-3" />
                  {resendCooldown > 0 ? `Ridërgo (${resendCooldown}s)` : 'Ridërgo kodin'}
                </button>
              </div>
              <button
                className="text-xs text-muted-foreground hover:underline"
                onClick={() => setVerificationOpen(false)}
              >
                Anulo
              </button>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
};

export default EmployerRegister;

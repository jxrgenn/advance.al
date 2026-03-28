import { Link } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { ArrowRight, UserPlus, Sparkles } from "lucide-react";
import { motion } from "motion/react";

interface QuickUserBannerProps {
  variant?: 'signup' | 'cv';
}

export function QuickUserBanner({ variant = 'signup' }: QuickUserBannerProps) {
  const isCV = variant === 'cv';

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
    >
      <Link to={isCV ? "/profile" : "/jobseekers?quick=true"} className="block">
        <Card className="border-2 border-primary/20 bg-gradient-to-r from-primary/5 via-primary/10 to-primary/5 hover:border-primary/40 hover:shadow-lg transition-all duration-300 cursor-pointer group">
          <div className="p-4 md:p-5">
            <div className="flex items-center gap-4">
              <div className="flex-shrink-0 w-16 h-16 md:w-20 md:h-20 rounded-xl bg-primary/10 flex items-center justify-center">
                {isCV ? (
                  <Sparkles className="w-8 h-8 md:w-10 md:h-10 text-primary" />
                ) : (
                  <UserPlus className="w-8 h-8 md:w-10 md:h-10 text-primary" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm md:text-base font-bold text-foreground leading-snug mb-1">
                  {isCV ? "Krijo CV Profesionale me AI" : "Regjistrohu Tani — Është Falas!"}
                </p>
                <p className="text-xs md:text-sm text-muted-foreground leading-snug line-clamp-2">
                  {isCV
                    ? "Gjenero CV-në tënde në sekonda dhe apliko me 1-klik për çdo pozicion."
                    : "Merr njoftime për punë të reja. Thjesht jep emrin dhe çfarë bën."
                  }
                </p>
              </div>
              <div className="flex-shrink-0">
                <ArrowRight className="w-5 h-5 md:w-6 md:h-6 text-primary group-hover:translate-x-1 transition-transform" />
              </div>
            </div>
          </div>
        </Card>
      </Link>
    </motion.div>
  );
}

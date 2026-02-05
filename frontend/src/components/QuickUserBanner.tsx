import { Link } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { ArrowRight, UserPlus, Sparkles } from "lucide-react";
import { motion } from "motion/react";

export function QuickUserBanner() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
    >
      <Link to="/jobseekers?quick=true" className="block">
        <Card className="border-2 border-primary/20 bg-gradient-to-r from-primary/5 via-primary/10 to-primary/5 hover:border-primary/40 hover:shadow-lg transition-all duration-300 cursor-pointer group">
          <div className="p-3 md:p-4">
            <div className="flex items-center justify-between gap-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <UserPlus className="w-4 h-4 text-primary flex-shrink-0" />
                  <p className="text-sm md:text-base font-semibold text-foreground leading-tight line-clamp-2">
                    Regjistrohu shpejtë dhe merr njoftime për punë! Thjesht jep emrin dhe çfarë bën.
                  </p>
                </div>
              </div>
              <div className="flex-shrink-0">
                <ArrowRight className="w-4 h-4 md:w-5 md:h-5 text-primary group-hover:translate-x-1 transition-transform" />
              </div>
            </div>
          </div>
        </Card>
      </Link>
    </motion.div>
  );
}

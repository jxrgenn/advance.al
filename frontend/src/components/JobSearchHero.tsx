import { motion } from "motion/react";
import { Container } from "@mantine/core";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import { ArrowRight, Search } from "lucide-react";

export function JobSearchHero() {
  return (
    <section className="w-full relative overflow-hidden">
      {/* Animated gradient background */}
      <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-background to-primary/10" />
      <motion.div
        className="absolute inset-0"
        style={{
          background: "radial-gradient(circle at 20% 50%, hsl(220 85% 25% / 0.1) 0%, transparent 50%)",
        }}
        animate={{
          opacity: [0.3, 0.5, 0.3],
        }}
        transition={{ duration: 8, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.div
        className="absolute inset-0"
        style={{
          background: "radial-gradient(circle at 80% 50%, hsl(220 85% 25% / 0.15) 0%, transparent 50%)",
        }}
        animate={{
          opacity: [0.2, 0.4, 0.2],
        }}
        transition={{ duration: 10, repeat: Infinity, ease: "easeInOut", delay: 1 }}
      />
      
      {/* Decorative blobs */}
      <motion.div
        className="absolute top-0 right-0 w-96 h-96 bg-primary/10 rounded-full blur-3xl"
        animate={{
          scale: [1, 1.2, 1],
          x: [0, 50, 0],
          y: [0, -30, 0],
        }}
        transition={{ duration: 10, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.div
        className="absolute bottom-0 left-0 w-80 h-80 bg-primary/5 rounded-full blur-3xl"
        animate={{
          scale: [1, 1.3, 1],
          x: [0, -40, 0],
          y: [0, 40, 0],
        }}
        transition={{ duration: 12, repeat: Infinity, ease: "easeInOut" }}
      />

      <div className="px-4 sm:px-6 lg:px-8">
        <Container size="lg" px={0} className="relative !pt-12 md:!pt-16 !pb-4 md:!pb-8">
          <div className="grid md:grid-cols-[1.2fr_1fr] gap-8 md:gap-12 items-center">
          {/* Left content */}
          <motion.div 
            className="space-y-6 z-10 relative"
            initial={{ opacity: 0, x: -50 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
          >
            <motion.div
              className="space-y-4 text-center md:text-left"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3, duration: 0.8 }}
            >
              <h1 className="text-5xl md:text-6xl lg:text-7xl font-extrabold leading-[1.1] tracking-tight">
                <span className="block text-foreground">NDERTO</span>
                <motion.span
                  className="block bg-gradient-to-r from-primary via-primary/90 to-primary/70 bg-clip-text text-transparent"
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.5, duration: 0.8 }}
                >
                  KARRIEREN TENDE!
                </motion.span>
              </h1>
            </motion.div>
            
            <motion.p 
              className="text-xl md:text-2xl text-muted-foreground leading-relaxed max-w-xl font-medium text-center md:text-left mx-auto md:mx-0"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4, duration: 0.8 }}
            >
              Zgjidhni punët që përshtaten me ambicjet dhe parimet tuaja!
            </motion.p>
            
            <motion.div 
              className="flex flex-wrap gap-4 pt-4 justify-center md:justify-start"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.6, duration: 0.8 }}
            >
              <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
                <Button 
                  size="lg" 
                  className="text-base md:text-lg px-8 py-7 bg-gradient-to-r from-primary to-primary/90 hover:from-primary/90 hover:to-primary shadow-2xl hover:shadow-primary/30 transition-all duration-300 group relative overflow-hidden"
                  asChild
                >
                  <Link to="/jobs" className="relative z-10 flex items-center">
                    <Search className="mr-2 h-5 w-5 group-hover:rotate-12 transition-transform duration-300" />
                    Kërko punë
                    <ArrowRight className="ml-2 h-5 w-5 group-hover:translate-x-1 transition-transform duration-300" />
                  </Link>
                </Button>
              </motion.div>
              
              <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
                <Button 
                  size="lg" 
                  variant="outline"
                  className="text-base md:text-lg px-8 py-7 border-2 bg-background/80 backdrop-blur-sm hover:bg-background/90 hover:border-primary/50 shadow-lg hover:shadow-xl transition-all duration-300 group"
                  asChild
                >
                  <Link to="/login?tab=register&type=jobseeker" className="relative z-10">
                    Krijo Llogari
                  </Link>
                </Button>
              </motion.div>
            </motion.div>
          </motion.div>
          
          {/* Right illustration with glassmorphism card */}
          <motion.div 
            className="flex justify-center items-center relative"
            initial={{ opacity: 0, scale: 0.8, x: 50 }}
            animate={{ opacity: 1, scale: 1, x: 0 }}
            transition={{ delay: 0.4, duration: 1, ease: [0.16, 1, 0.3, 1] }}
          >
            {/* Image container - breathing animation only */}
            <motion.img 
              src="/3d_assets/climbing_success1.png" 
              alt="Career growth - climbing to success" 
              className="w-full max-w-[360px] md:max-w-[480px] h-auto relative z-10"
              animate={{ 
                scale: [1, 1.03, 1]
              }}
              transition={{ 
                duration: 3,
                repeat: Infinity,
                ease: "easeInOut"
              }}
            />
          </motion.div>
        </div>
        </Container>
      </div>
    </section>
  );
}
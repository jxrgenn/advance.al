import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { User } from 'lucide-react';

// Node data type
interface NodeData {
  id: number;
  x: number;
  y: number;
  originalX: number;
  originalY: number;
  size: number;
  color: string;
  targetX: number;
  targetY: number;
  wanderSpeed: number;
  movementRange: number;
}

// Connection type
interface Connection {
  from: number;
  to: number;
}

export default function AdvanceLanding() {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasContainerRef = useRef<HTMLDivElement>(null);
  const nodesContainerRef = useRef<HTMLDivElement>(null);
  const [isLoaded, setIsLoaded] = useState(false);
  const [initialNodes, setInitialNodes] = useState<NodeData[]>([]);
  const [containerSize, setContainerSize] = useState({ width: 400, height: 400 });
  
  // Refs for animation - no React state updates during animation
  const animationRef = useRef<number>();
  const nodesRef = useRef<NodeData[]>([]);
  const nodeElementsRef = useRef<Map<number, HTMLDivElement>>(new Map());
  const connectionsRef = useRef<Connection[]>([]);
  const containerSizeRef = useRef({ width: 400, height: 400 });
  const threeRef = useRef<{
    renderer: THREE.WebGLRenderer;
    scene: THREE.Scene;
    camera: THREE.OrthographicCamera;
    lines: THREE.Line[];
  } | null>(null);

  // Colors - site's accent blues
  const colors = {
    primaryBlue: '#092f5f',
    primaryBlueLight: '#1e4a7a',
    primaryBlueLighter: '#3d6ba3',
    lightBlueAccent: '#7da3c9',
    gray: '#a0aab8',
  };

  // Convert 3D coordinates to screen position
  const toScreenPosition = (x: number, y: number, size: { width: number; height: number }) => {
    const screenX = ((x + 8) / 16) * size.width;
    const screenY = ((-y + 8) / 16) * size.height;
    return { left: screenX, top: screenY };
  };

  // Initialize nodes and connections (only once)
  useEffect(() => {
    const perimeterNodes = 16;
    const interiorNodes = 6;
    const totalNodes = perimeterNodes + interiorNodes;
    const nodeData: NodeData[] = [];
    const connections: Connection[] = [];

    const baseRadiusX = 5.2;
    const baseRadiusY = 4.3;

    // Create perimeter nodes
    for (let i = 0; i < perimeterNodes; i++) {
      const angle = (i / perimeterNodes) * Math.PI * 2;
      const noiseX = (Math.random() - 0.5) * 0.8;
      const noiseY = (Math.random() - 0.5) * 0.8;
      const radiusVariation = 0.7 + Math.random() * 0.6;

      const x = (baseRadiusX + noiseX) * radiusVariation * Math.cos(angle);
      const y = (baseRadiusY + noiseY) * radiusVariation * Math.sin(angle);

      const isGray = i % 6 === 0;
      let color: string;
      if (isGray) {
        color = colors.gray;
      } else {
        const rand = Math.random();
        if (rand < 0.4) color = colors.primaryBlue;
        else if (rand < 0.7) color = colors.primaryBlueLight;
        else if (rand < 0.9) color = colors.primaryBlueLighter;
        else color = colors.lightBlueAccent;
      }

      const size = 0.55 + Math.random() * 0.25;
      const distanceFromCenter = Math.sqrt(x * x + y * y);
      const normalizedDistance = Math.min(distanceFromCenter / 6, 1);
      const movementRange = 0.5 + normalizedDistance * 0.6;

      nodeData.push({
        id: i,
        x, y,
        originalX: x,
        originalY: y,
        size,
        color,
        targetX: x + (Math.random() - 0.5) * movementRange * 2,
        targetY: y + (Math.random() - 0.5) * movementRange * 2,
        wanderSpeed: 0.012 + Math.random() * 0.008,
        movementRange,
      });
    }

    // Create interior nodes
    for (let i = 0; i < interiorNodes; i++) {
      const angle = Math.random() * Math.PI * 2;
      const radius = Math.random() * 2.5;
      const x = radius * Math.cos(angle);
      const y = radius * Math.sin(angle);

      const isGray = i === 2;
      let color: string;
      if (isGray) {
        color = colors.gray;
      } else {
        const rand = Math.random();
        if (rand < 0.35) color = colors.primaryBlue;
        else if (rand < 0.65) color = colors.primaryBlueLight;
        else if (rand < 0.85) color = colors.primaryBlueLighter;
        else color = colors.lightBlueAccent;
      }

      const size = 0.5 + Math.random() * 0.3;
      const distanceFromCenter = Math.sqrt(x * x + y * y);
      const normalizedDistance = Math.min(distanceFromCenter / 6, 1);
      const movementRange = 0.5 + normalizedDistance * 0.6;

      nodeData.push({
        id: perimeterNodes + i,
        x, y,
        originalX: x,
        originalY: y,
        size,
        color,
        targetX: x + (Math.random() - 0.5) * movementRange * 2,
        targetY: y + (Math.random() - 0.5) * movementRange * 2,
        wanderSpeed: 0.012 + Math.random() * 0.008,
        movementRange,
      });
    }

    // Relaxation algorithm
    const minNodeDistance = 1.2;
    for (let iter = 0; iter < 50; iter++) {
      for (let i = 0; i < nodeData.length; i++) {
        for (let j = i + 1; j < nodeData.length; j++) {
          const dx = nodeData[j].x - nodeData[i].x;
          const dy = nodeData[j].y - nodeData[i].y;
          const dist = Math.sqrt(dx * dx + dy * dy);

          if (dist < minNodeDistance && dist > 0.001) {
            const overlap = (minNodeDistance - dist) / 2;
            const nx = dx / dist;
            const ny = dy / dist;

            nodeData[i].x -= nx * overlap;
            nodeData[i].y -= ny * overlap;
            nodeData[i].originalX = nodeData[i].x;
            nodeData[i].originalY = nodeData[i].y;
            nodeData[j].x += nx * overlap;
            nodeData[j].y += ny * overlap;
            nodeData[j].originalX = nodeData[j].x;
            nodeData[j].originalY = nodeData[j].y;
          }
        }
      }
    }

    // Create connections
    for (let i = 0; i < perimeterNodes; i++) {
      connections.push({ from: i, to: (i + 1) % perimeterNodes });
    }

    for (let i = 0; i < perimeterNodes; i += 2) {
      const step = 2 + Math.floor(Math.random() * 3);
      const target = (i + step) % perimeterNodes;
      if (!connections.some(c => (c.from === i && c.to === target) || (c.from === target && c.to === i))) {
        connections.push({ from: i, to: target });
      }
    }

    for (let i = perimeterNodes; i < totalNodes; i++) {
      const numConnections = 2 + Math.floor(Math.random() * 2);
      const connected = new Set<number>();
      for (let j = 0; j < numConnections; j++) {
        let target: number;
        do {
          target = Math.floor(Math.random() * perimeterNodes);
        } while (connected.has(target));
        connected.add(target);
        connections.push({ from: i, to: target });
      }
    }

    for (let i = perimeterNodes; i < totalNodes - 1; i++) {
      if (Math.random() > 0.5) {
        const target = perimeterNodes + Math.floor(Math.random() * interiorNodes);
        if (target !== i && target < totalNodes) {
          if (!connections.some(c => (c.from === i && c.to === target) || (c.from === target && c.to === i))) {
            connections.push({ from: i, to: target });
          }
        }
      }
    }

    for (let i = 0; i < totalNodes * 0.2; i++) {
      const a = Math.floor(Math.random() * totalNodes);
      const b = Math.floor(Math.random() * totalNodes);
      if (a !== b && !connections.some(c => (c.from === a && c.to === b) || (c.from === b && c.to === a))) {
        connections.push({ from: a, to: b });
      }
    }

    nodesRef.current = nodeData;
    connectionsRef.current = connections;
    setInitialNodes(nodeData); // Only set once for initial render
  }, []);

  // Initialize Three.js for lines
  useEffect(() => {
    if (!canvasContainerRef.current || initialNodes.length === 0) return;

    const scene = new THREE.Scene();
    const camera = new THREE.OrthographicCamera(-8, 8, 8, -8, 0.1, 1000);
    camera.position.z = 20;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setClearColor(0x000000, 0);
    
    const updateSize = () => {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const size = Math.min(rect.width, rect.height) || 400;
      renderer.setSize(size, size);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      containerSizeRef.current = { width: size, height: size };
      setContainerSize({ width: size, height: size });
    };

    canvasContainerRef.current.appendChild(renderer.domElement);
    updateSize();
    requestAnimationFrame(updateSize);
    window.addEventListener('resize', updateSize);

    const lineMaterial = new THREE.LineBasicMaterial({
      color: 0x092f5f,
      transparent: true,
      opacity: 0.5,
    });

    const lines: THREE.Line[] = [];
    connectionsRef.current.forEach(conn => {
      const startNode = nodesRef.current[conn.from];
      const endNode = nodesRef.current[conn.to];
      if (startNode && endNode) {
        const geometry = new THREE.BufferGeometry().setFromPoints([
          new THREE.Vector3(startNode.x, startNode.y, 0),
          new THREE.Vector3(endNode.x, endNode.y, 0),
        ]);
        const line = new THREE.Line(geometry, lineMaterial);
        line.userData = { from: conn.from, to: conn.to };
        scene.add(line);
        lines.push(line);
      }
    });

    threeRef.current = { renderer, scene, camera, lines };
    setIsLoaded(true);

    return () => {
      window.removeEventListener('resize', updateSize);
      if (canvasContainerRef.current && renderer.domElement) {
        canvasContainerRef.current.removeChild(renderer.domElement);
      }
      renderer.dispose();
    };
  }, [initialNodes.length > 0]);

  // Animation loop - DIRECT DOM MANIPULATION, no React state
  useEffect(() => {
    if (!isLoaded) return;

    const animate = () => {
      const currentNodes = nodesRef.current;
      const size = containerSizeRef.current;

      if (currentNodes.length === 0) {
        animationRef.current = requestAnimationFrame(animate);
        return;
      }

      // Calculate desired positions
      const desiredPositions = currentNodes.map(node => {
        const toTargetX = node.targetX - node.x;
        const toTargetY = node.targetY - node.y;
        const distToTarget = Math.sqrt(toTargetX * toTargetX + toTargetY * toTargetY);

        let desiredX = node.x + toTargetX * node.wanderSpeed;
        let desiredY = node.y + toTargetY * node.wanderSpeed;

        if (distToTarget < 0.1) {
          node.targetX = node.originalX + (Math.random() - 0.5) * node.movementRange * 2;
          node.targetY = node.originalY + (Math.random() - 0.5) * node.movementRange * 2;
        }

        return { x: desiredX, y: desiredY };
      });

      // Apply collision avoidance
      const minDistance = 1.2;
      const repulsionStrength = 0.15;

      currentNodes.forEach((node, i) => {
        let finalX = desiredPositions[i].x;
        let finalY = desiredPositions[i].y;

        currentNodes.forEach((other, j) => {
          if (i === j) return;
          const dx = finalX - desiredPositions[j].x;
          const dy = finalY - desiredPositions[j].y;
          const distance = Math.sqrt(dx * dx + dy * dy);

          if (distance < minDistance && distance > 0.001) {
            const overlap = minDistance - distance;
            const force = (overlap / minDistance) * repulsionStrength;
            const invDistance = 1 / distance;
            finalX += (dx * invDistance) * force;
            finalY += (dy * invDistance) * force;
          }
        });

        // Smooth interpolation
        const smoothing = 0.1;
        node.x += (finalX - node.x) * smoothing;
        node.y += (finalY - node.y) * smoothing;

        // DIRECT DOM UPDATE - no React re-render
        const element = nodeElementsRef.current.get(node.id);
        if (element) {
          const pos = toScreenPosition(node.x, node.y, size);
          element.style.transform = `translate(${pos.left}px, ${pos.top}px) translate(-50%, -50%)`;
        }
      });

      // Update Three.js lines
      if (threeRef.current) {
        const { renderer, scene, camera, lines } = threeRef.current;

        lines.forEach(line => {
          const fromNode = currentNodes[line.userData.from];
          const toNode = currentNodes[line.userData.to];
          if (fromNode && toNode) {
            const positions = line.geometry.attributes.position;
            if (positions) {
              const dx = toNode.x - fromNode.x;
              const dy = toNode.y - fromNode.y;
              const distance = Math.sqrt(dx * dx + dy * dy);

              if (distance > 0.01) {
                const fromRadius = fromNode.size * 0.9;
                const toRadius = toNode.size * 0.9;
                const offsetFrom = fromRadius / distance;
                const offsetTo = toRadius / distance;

                positions.array[0] = fromNode.x + dx * offsetFrom;
                positions.array[1] = fromNode.y + dy * offsetFrom;
                positions.array[2] = 0;
                positions.array[3] = toNode.x - dx * offsetTo;
                positions.array[4] = toNode.y - dy * offsetTo;
                positions.array[5] = 0;
              } else {
                positions.array[0] = fromNode.x;
                positions.array[1] = fromNode.y;
                positions.array[2] = 0;
                positions.array[3] = toNode.x;
                positions.array[4] = toNode.y;
                positions.array[5] = 0;
              }
              positions.needsUpdate = true;
            }
          }
        });

        renderer.render(scene, camera);
      }

      animationRef.current = requestAnimationFrame(animate);
    };

    animationRef.current = requestAnimationFrame(animate);

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [isLoaded]);

  // Register node element refs
  const registerNodeRef = (id: number, element: HTMLDivElement | null) => {
    if (element) {
      nodeElementsRef.current.set(id, element);
    } else {
      nodeElementsRef.current.delete(id);
    }
  };

  return (
    <div style={styles.page}>
      {/* Accent line */}
      <div style={styles.accentLine}></div>

      {/* Subtle background pattern */}
      <div className="absolute inset-0 opacity-[0.02]" style={styles.backgroundPattern}></div>

      {/* Hero Section */}
      <section className="py-20 lg:py-24 min-h-screen flex items-center relative z-10">
        <div className="container mx-auto px-4">
          <div className="flex flex-col lg:flex-row items-center lg:items-center justify-between gap-12 lg:gap-16">
            {/* Left Content */}
            <div className="flex-1 w-full lg:max-w-[540px] text-center lg:text-left relative">
              <div className="hidden lg:block absolute -left-8 top-0 w-1 h-20 bg-gradient-to-b from-primary to-transparent rounded-full opacity-60"></div>
              
              <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold leading-[1.15] mb-6 lg:mb-7 text-foreground tracking-tight">
                <span className="text-primary font-extrabold relative inline-block">
                  Advance.al
                  <span className="absolute -bottom-1 left-0 right-0 h-1 bg-primary/20 rounded-full"></span>
                </span>
                {' '}është platforma e vetme në Shqipëri e përkushtuar totalisht në tregun e punës.
              </h1>
              
              <p className="text-lg sm:text-xl lg:text-[1.25rem] text-muted-foreground mb-8 lg:mb-10 leading-relaxed font-light">
                Advance.al bashkon kompanitë më të mira me talentet më të specializuar për të ndërtuar biznese te suksesshme dhe karriera të shkëlqyera!
              </p>
              
              <div className="flex flex-col sm:flex-row gap-4 justify-center lg:justify-start">
                <button 
                  className="group relative px-8 py-4 text-base font-bold text-primary-foreground bg-primary rounded-xl cursor-pointer transition-all duration-300 hover:shadow-2xl hover:shadow-primary/30 hover:-translate-y-1 overflow-hidden"
                  onClick={() => window.location.href = '/jobseekers'}
                >
                  <span className="relative z-10">Gjej pune</span>
                  <div className="absolute inset-0 bg-gradient-to-r from-primary to-primary/80 opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
                </button>
                <button 
                  className="px-8 py-4 text-base font-semibold text-foreground bg-background border-2 border-border rounded-xl cursor-pointer transition-all duration-300 hover:border-primary hover:text-primary hover:shadow-lg hover:-translate-y-0.5"
                  onClick={() => window.location.href = '/employers'}
                >
                  Posto pune
                </button>
              </div>
            </div>

            {/* Right Visualization */}
            <div className="flex-1 w-full flex justify-center lg:justify-end items-center relative">
              {/* Decorative background circles */}
              <div className="absolute -right-20 -top-20 w-96 h-96 bg-primary/5 rounded-full blur-3xl pointer-events-none"></div>
              <div className="absolute -right-10 -bottom-10 w-64 h-64 bg-primary/3 rounded-full blur-2xl pointer-events-none"></div>
              
              <div className="relative z-10">
                <div 
                  ref={containerRef}
                  className="relative w-[300px] h-[300px] sm:w-[400px] sm:h-[400px] md:w-[500px] md:h-[500px] lg:w-[550px] lg:h-[550px]"
                  style={{
                    opacity: isLoaded ? 1 : 0,
                    transition: 'opacity 0.8s ease-out'
                  }}
                >
                  {/* Three.js canvas for lines */}
                  <div 
                    ref={canvasContainerRef}
                    className="absolute inset-0 flex items-center justify-center"
                    style={{ pointerEvents: 'none' }}
                  />
                  
                  {/* Nodes overlay */}
                  <div 
                    ref={nodesContainerRef}
                    className="absolute inset-0 flex items-center justify-center" 
                    style={{ pointerEvents: 'none' }}
                  >
                    <div 
                      className="relative"
                      style={{ 
                        width: containerSize.width, 
                        height: containerSize.height,
                        position: 'relative',
                      }}
                    >
                      {initialNodes.map((node) => {
                        const pos = toScreenPosition(node.x, node.y, containerSize);
                        const baseSize = node.size * (containerSize.width / 16) * 2;
                        const iconSize = baseSize * 0.5;
                        
                        return (
                          <div
                            key={node.id}
                            ref={(el) => registerNodeRef(node.id, el)}
                            className="absolute flex items-center justify-center rounded-full"
                            style={{
                              left: 0,
                              top: 0,
                              width: baseSize,
                              height: baseSize,
                              transform: `translate(${pos.left}px, ${pos.top}px) translate(-50%, -50%)`,
                              backgroundColor: node.color,
                              boxShadow: `0 4px 14px ${node.color}50, 0 2px 6px rgba(0,0,0,0.15)`,
                              willChange: 'transform',
                            }}
                          >
                            <User 
                              size={iconSize} 
                              color="white" 
                              strokeWidth={2.5}
                              style={{ opacity: 0.95 }}
                            />
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: {
    minHeight: '100vh',
    background: 'linear-gradient(to bottom, hsl(var(--background)), hsl(var(--background)))',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
    position: 'relative',
    overflow: 'hidden',
  },
  accentLine: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: '4px',
    background: `linear-gradient(90deg, hsl(var(--primary)) 0%, hsl(var(--ring)) 50%, hsl(var(--primary)) 100%)`,
  },
  backgroundPattern: {
    backgroundImage: `radial-gradient(circle at 1px 1px, hsl(var(--primary) / 0.15) 1px, transparent 0)`,
    backgroundSize: '24px 24px',
  },
};

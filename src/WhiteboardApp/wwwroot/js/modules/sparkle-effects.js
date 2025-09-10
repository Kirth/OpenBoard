// Sparkle Effects Module - Particle system for element restoration animations
// Provides visual feedback when elements are restored during undo operations

// Dependencies will be injected by main coordinator
let dependencies = {};

export function setDependencies(deps) {
  dependencies = deps;
}

// Poof particle class for deletion effects
class PoofParticle {
  constructor(x, y, delay = 0) {
    this.startX = x;
    this.startY = y;
    this.x = x;
    this.y = y;
    this.delay = delay;
    this.startTime = Date.now() + delay;
    this.duration = 400 + Math.random() * 200; // 400-600ms (faster than sparkles)
    this.size = 4 + Math.random() * 6; // 4-10px (slightly larger)
    this.maxSize = this.size;
    this.velocityX = (Math.random() - 0.5) * 80; // More dramatic spread
    this.velocityY = (Math.random() - 0.5) * 80;
    this.rotation = Math.random() * Math.PI * 2;
    this.rotationSpeed = (Math.random() - 0.5) * 0.3; // Faster rotation
    this.color = this.getPoofColor();
    this.completed = false;
    this.shape = Math.random() < 0.3 ? 'cloud' : 'circle'; // Mix of shapes
  }

  getPoofColor() {
    // Smoky gray colors for poof effect
    const colors = [
      'rgba(150, 150, 150, 1)',  // Light gray
      'rgba(120, 120, 120, 1)',  // Medium gray
      'rgba(180, 180, 180, 1)',  // Lighter gray
      'rgba(100, 100, 100, 1)'   // Darker gray
    ];
    return colors[Math.floor(Math.random() * colors.length)];
  }

  update() {
    const now = Date.now();
    if (now < this.startTime) {
      return; // Particle hasn't started yet due to delay
    }

    const elapsed = now - this.startTime;
    const progress = Math.min(elapsed / this.duration, 1);

    if (progress >= 1) {
      this.completed = true;
      return;
    }

    // Easing function - ease out for poof (more dramatic)
    const easeOut = 1 - Math.pow(1 - progress, 2);
    
    // Update position with more spread
    this.x = this.startX + this.velocityX * easeOut;
    this.y = this.startY + this.velocityY * easeOut;

    // Update size (quick expansion then fade)
    if (progress < 0.2) {
      this.size = (progress / 0.2) * this.maxSize * 1.5; // Quick expansion
    } else {
      this.size = this.maxSize * 1.5 * (1 - ((progress - 0.2) / 0.8)); // Slow fade
    }

    // Update rotation
    this.rotation += this.rotationSpeed;

    // Update opacity (quicker fade)
    const opacity = Math.max(0, 1 - (progress * progress * progress)); // Cubic fade out
    this.color = this.color.replace(/rgba\(([^)]+)\)/, (match, values) => {
      const [r, g, b] = values.split(',').map(v => v.trim());
      return `rgba(${r}, ${g}, ${b}, ${opacity})`;
    });
  }

  render(ctx) {
    if (this.completed || Date.now() < this.startTime || this.size <= 0) {
      return;
    }

    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(this.rotation);
    
    if (this.shape === 'cloud') {
      this.drawCloud(ctx, 0, 0, this.size);
    } else {
      this.drawCircle(ctx, 0, 0, this.size);
    }
    
    ctx.restore();
  }

  drawCircle(ctx, centerX, centerY, radius) {
    ctx.fillStyle = this.color;
    ctx.beginPath();
    ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
    ctx.fill();
  }

  drawCloud(ctx, centerX, centerY, size) {
    ctx.fillStyle = this.color;
    const radius = size * 0.7;
    
    // Draw a cloud-like shape with multiple circles
    ctx.beginPath();
    ctx.arc(centerX - radius * 0.5, centerY, radius * 0.8, 0, Math.PI * 2);
    ctx.arc(centerX + radius * 0.5, centerY, radius * 0.8, 0, Math.PI * 2);
    ctx.arc(centerX, centerY - radius * 0.3, radius, 0, Math.PI * 2);
    ctx.arc(centerX - radius * 0.3, centerY + radius * 0.3, radius * 0.6, 0, Math.PI * 2);
    ctx.arc(centerX + radius * 0.3, centerY + radius * 0.3, radius * 0.6, 0, Math.PI * 2);
    ctx.fill();
  }
}

// Sparkle particle class
class SparkleParticle {
  constructor(x, y, delay = 0) {
    this.startX = x;
    this.startY = y;
    this.x = x;
    this.y = y;
    this.delay = delay;
    this.startTime = Date.now() + delay;
    this.duration = 600 + Math.random() * 200; // 600-800ms
    this.size = 3 + Math.random() * 4; // 3-7px
    this.maxSize = this.size;
    this.velocityX = (Math.random() - 0.5) * 40; // Random horizontal drift
    this.velocityY = (Math.random() - 0.5) * 40; // Random vertical drift
    this.rotation = Math.random() * Math.PI * 2;
    this.rotationSpeed = (Math.random() - 0.5) * 0.2;
    this.color = this.getSparkleColor();
    this.completed = false;
  }

  getSparkleColor() {
    // Golden sparkle colors with some variation
    const colors = [
      'rgba(255, 215, 0, 1)',   // Gold
      'rgba(255, 255, 255, 1)', // White
      'rgba(255, 235, 59, 1)',  // Light gold
      'rgba(255, 193, 7, 1)'    // Amber
    ];
    return colors[Math.floor(Math.random() * colors.length)];
  }

  update() {
    const now = Date.now();
    if (now < this.startTime) {
      return; // Particle hasn't started yet due to delay
    }

    const elapsed = now - this.startTime;
    const progress = Math.min(elapsed / this.duration, 1);

    if (progress >= 1) {
      this.completed = true;
      return;
    }

    // Easing function - ease out cubic
    const easeOut = 1 - Math.pow(1 - progress, 3);
    const fadeProgress = progress;

    // Update position with slight drift
    this.x = this.startX + this.velocityX * easeOut * 0.5;
    this.y = this.startY + this.velocityY * easeOut * 0.5 - (progress * 20); // Slight upward drift

    // Update size (starts small, grows, then shrinks)
    if (progress < 0.3) {
      this.size = (progress / 0.3) * this.maxSize;
    } else {
      this.size = this.maxSize * (1 - ((progress - 0.3) / 0.7));
    }

    // Update rotation
    this.rotation += this.rotationSpeed;

    // Update opacity (fade out towards end)
    const opacity = Math.max(0, 1 - (progress * progress)); // Quadratic fade out
    this.color = this.color.replace(/rgba\(([^)]+)\)/, (match, values) => {
      const [r, g, b] = values.split(',').map(v => v.trim());
      return `rgba(${r}, ${g}, ${b}, ${opacity})`;
    });
  }

  render(ctx) {
    if (this.completed || Date.now() < this.startTime || this.size <= 0) {
      return;
    }

    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(this.rotation);
    
    // Draw sparkle as a star shape
    this.drawStar(ctx, 0, 0, 5, this.size, this.size * 0.5);
    
    ctx.restore();
  }

  drawStar(ctx, centerX, centerY, spikes, outerRadius, innerRadius) {
    ctx.fillStyle = this.color;
    ctx.strokeStyle = this.color;
    ctx.lineWidth = 0.5;
    
    ctx.beginPath();
    
    const step = Math.PI / spikes;
    let rot = Math.PI / 2 * 3;
    
    ctx.moveTo(centerX, centerY - outerRadius);
    
    for (let i = 0; i < spikes; i++) {
      ctx.lineTo(centerX + Math.cos(rot) * outerRadius, centerY + Math.sin(rot) * outerRadius);
      rot += step;
      ctx.lineTo(centerX + Math.cos(rot) * innerRadius, centerY + Math.sin(rot) * innerRadius);
      rot += step;
    }
    
    ctx.lineTo(centerX, centerY - outerRadius);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }
}

// Poof effect for deleted elements
class ElementPoofEffect {
  constructor(element) {
    this.elementId = element.id;
    this.element = element;
    this.particles = [];
    this.startTime = Date.now();
    this.duration = 800; // Total effect duration
    this.completed = false;
    
    this.generatePoofParticles();
  }

  generatePoofParticles() {
    const particleCount = 15 + Math.floor(Math.random() * 10); // 15-25 particles for more dramatic effect
    
    if (this.isPathBasedElement()) {
      this.generatePathBasedPoofParticles(particleCount);
    } else {
      this.generateBoundingBoxPoofParticles(particleCount);
    }
  }

  isPathBasedElement() {
    return this.element.type === 'Line' || this.element.type === 'Path' || this.element.type === 'Drawing';
  }

  generatePathBasedPoofParticles(particleCount) {
    if (this.element.type === 'Line') {
      this.generateLinePoofParticles(particleCount);
    } else if (this.element.type === 'Path' || this.element.type === 'Drawing') {
      this.generatePathPoofParticles(particleCount);
    }
  }

  generateLinePoofParticles(particleCount) {
    // Use actual line endpoints from data
    const startX = this.element.data?.startX || this.element.x;
    const startY = this.element.data?.startY || this.element.y;
    const endX = this.element.data?.endX || (this.element.x + this.element.width);
    const endY = this.element.data?.endY || (this.element.y + this.element.height);

    // Generate particles along the line with some spread
    for (let i = 0; i < particleCount; i++) {
      const t = Math.random(); // Random position along line instead of even distribution for poof
      const x = startX + t * (endX - startX);
      const y = startY + t * (endY - startY);
      
      // Add random spread around the line (larger spread for poof effect)
      const spreadRadius = 20 + Math.random() * 15; // 20-35px spread
      const spreadAngle = Math.random() * Math.PI * 2;
      
      const finalX = x + Math.cos(spreadAngle) * spreadRadius;
      const finalY = y + Math.sin(spreadAngle) * spreadRadius;
      
      const delay = Math.random() * 100; // Quick staggering
      this.particles.push(new PoofParticle(finalX, finalY, delay));
    }
  }

  generatePathPoofParticles(particleCount) {
    const pathData = this.element.data?.path;
    if (!pathData || pathData.length === 0) {
      // Fallback to bounding box if path data is missing
      this.generateBoundingBoxPoofParticles(particleCount);
      return;
    }

    // Convert relative path coordinates to world coordinates
    const worldPath = pathData.map(point => ({
      x: this.element.x + point.x,
      y: this.element.y + point.y
    }));

    if (worldPath.length === 1) {
      // Single point - generate poof around that point
      const point = worldPath[0];
      for (let i = 0; i < particleCount; i++) {
        const spreadRadius = 15 + Math.random() * 20; // 15-35px spread
        const spreadAngle = Math.random() * Math.PI * 2;
        
        const x = point.x + Math.cos(spreadAngle) * spreadRadius;
        const y = point.y + Math.sin(spreadAngle) * spreadRadius;
        
        const delay = Math.random() * 100;
        this.particles.push(new PoofParticle(x, y, delay));
      }
      return;
    }

    // For multi-point paths, randomly distribute particles along path segments
    for (let i = 0; i < particleCount; i++) {
      // Pick a random segment
      const segmentIndex = Math.floor(Math.random() * (worldPath.length - 1));
      const start = worldPath[segmentIndex];
      const end = worldPath[segmentIndex + 1];
      
      // Random position within the segment
      const t = Math.random();
      const x = start.x + t * (end.x - start.x);
      const y = start.y + t * (end.y - start.y);
      
      // Add random spread around the path point
      const spreadRadius = 15 + Math.random() * 20; // 15-35px spread
      const spreadAngle = Math.random() * Math.PI * 2;
      
      const finalX = x + Math.cos(spreadAngle) * spreadRadius;
      const finalY = y + Math.sin(spreadAngle) * spreadRadius;
      
      const delay = Math.random() * 100;
      this.particles.push(new PoofParticle(finalX, finalY, delay));
    }
  }

  generateBoundingBoxPoofParticles(particleCount) {
    // Generate particles from center and spread outward
    const centerX = this.element.x + this.element.width / 2;
    const centerY = this.element.y + this.element.height / 2;
    
    // Add particles in the center area
    for (let i = 0; i < particleCount; i++) {
      // Random position within element bounds
      const x = this.element.x + Math.random() * this.element.width;
      const y = this.element.y + Math.random() * this.element.height;
      const delay = Math.random() * 100; // Quick staggering
      
      this.particles.push(new PoofParticle(x, y, delay));
    }
  }

  update() {
    const now = Date.now();
    const elapsed = now - this.startTime;
    
    if (elapsed >= this.duration) {
      this.completed = true;
      return;
    }

    // Update all particles
    this.particles.forEach(particle => particle.update());
    
    // Remove completed particles
    this.particles = this.particles.filter(particle => !particle.completed);
    
    // Mark effect as completed if no particles remain
    if (this.particles.length === 0) {
      this.completed = true;
    }
  }

  render(ctx) {
    if (this.completed) return;
    
    this.particles.forEach(particle => particle.render(ctx));
  }
}

// Sparkle effect for an element
class ElementSparkleEffect {
  constructor(element) {
    this.elementId = element.id;
    this.element = element;
    this.particles = [];
    this.startTime = Date.now();
    this.duration = 1000; // Total effect duration
    this.completed = false;
    
    this.generateParticles();
  }

  generateParticles() {
    const particleCount = 12 + Math.floor(Math.random() * 8); // 12-20 particles
    
    if (this.isPathBasedElement()) {
      this.generatePathBasedParticles(particleCount);
    } else {
      this.generateBoundingBoxParticles(particleCount);
    }
  }

  isPathBasedElement() {
    return this.element.type === 'Line' || this.element.type === 'Path' || this.element.type === 'Drawing';
  }

  generatePathBasedParticles(particleCount) {
    if (this.element.type === 'Line') {
      this.generateLineParticles(particleCount);
    } else if (this.element.type === 'Path' || this.element.type === 'Drawing') {
      this.generatePathParticles(particleCount);
    }
  }

  generateLineParticles(particleCount) {
    // Use actual line endpoints from data
    const startX = this.element.data?.startX || this.element.x;
    const startY = this.element.data?.startY || this.element.y;
    const endX = this.element.data?.endX || (this.element.x + this.element.width);
    const endY = this.element.data?.endY || (this.element.y + this.element.height);

    // Distribute particles along the line
    for (let i = 0; i < particleCount; i++) {
      const t = i / (particleCount - 1); // Parameter from 0 to 1
      const x = startX + t * (endX - startX);
      const y = startY + t * (endY - startY);
      
      // Add small random offset perpendicular to line (10px closer to line)
      const lineLength = Math.sqrt((endX - startX) ** 2 + (endY - startY) ** 2);
      if (lineLength > 0) {
        const perpX = -(endY - startY) / lineLength; // Perpendicular vector
        const perpY = (endX - startX) / lineLength;
        const offsetDistance = (Math.random() - 0.5) * 16; // ±8px perpendicular offset
        
        const finalX = x + perpX * offsetDistance;
        const finalY = y + perpY * offsetDistance;
        
        const delay = Math.random() * 200;
        this.particles.push(new SparkleParticle(finalX, finalY, delay));
      } else {
        // Fallback for zero-length lines
        const delay = Math.random() * 200;
        this.particles.push(new SparkleParticle(x, y, delay));
      }
    }
  }

  generatePathParticles(particleCount) {
    const pathData = this.element.data?.path;
    if (!pathData || pathData.length === 0) {
      // Fallback to bounding box if path data is missing
      this.generateBoundingBoxParticles(particleCount);
      return;
    }

    // Convert relative path coordinates to world coordinates
    const worldPath = pathData.map(point => ({
      x: this.element.x + point.x,
      y: this.element.y + point.y
    }));

    // Calculate total path length for even distribution
    const segments = [];
    let totalLength = 0;
    
    for (let i = 1; i < worldPath.length; i++) {
      const prev = worldPath[i - 1];
      const curr = worldPath[i];
      const segmentLength = Math.sqrt((curr.x - prev.x) ** 2 + (curr.y - prev.y) ** 2);
      segments.push({
        start: prev,
        end: curr,
        length: segmentLength,
        startDistance: totalLength
      });
      totalLength += segmentLength;
    }

    if (totalLength === 0) {
      // Single point or zero-length path - fallback to single point
      const point = worldPath[0];
      for (let i = 0; i < particleCount; i++) {
        const angle = (Math.PI * 2 * i) / particleCount;
        const radius = 8 + Math.random() * 8; // 8-16px radius around point
        const x = point.x + Math.cos(angle) * radius;
        const y = point.y + Math.sin(angle) * radius;
        const delay = Math.random() * 200;
        this.particles.push(new SparkleParticle(x, y, delay));
      }
      return;
    }

    // Distribute particles evenly along the path
    for (let i = 0; i < particleCount; i++) {
      const targetDistance = (i / (particleCount - 1)) * totalLength;
      
      // Find the segment containing this distance
      let segment = null;
      for (let j = 0; j < segments.length; j++) {
        if (targetDistance <= segments[j].startDistance + segments[j].length) {
          segment = segments[j];
          break;
        }
      }
      
      if (segment) {
        // Interpolate position within the segment
        const segmentProgress = (targetDistance - segment.startDistance) / segment.length;
        const x = segment.start.x + segmentProgress * (segment.end.x - segment.start.x);
        const y = segment.start.y + segmentProgress * (segment.end.y - segment.start.y);
        
        // Add small random offset perpendicular to path segment
        const segmentLength = segment.length;
        if (segmentLength > 0) {
          const perpX = -(segment.end.y - segment.start.y) / segmentLength;
          const perpY = (segment.end.x - segment.start.x) / segmentLength;
          const offsetDistance = (Math.random() - 0.5) * 16; // ±8px perpendicular offset
          
          const finalX = x + perpX * offsetDistance;
          const finalY = y + perpY * offsetDistance;
          
          const delay = Math.random() * 200;
          this.particles.push(new SparkleParticle(finalX, finalY, delay));
        }
      }
    }
  }

  generateBoundingBoxParticles(particleCount) {
    const bounds = this.getElementBounds();
    
    // Generate particles around the element's perimeter
    for (let i = 0; i < particleCount; i++) {
      const position = this.getPerimeterPosition(bounds, i / particleCount);
      const delay = Math.random() * 200; // Stagger particle start times
      
      this.particles.push(new SparkleParticle(position.x, position.y, delay));
    }
  }

  getElementBounds() {
    const inset = 10; // Distance inside the element edge for sparkles
    return {
      left: this.element.x + inset,
      top: this.element.y + inset,
      right: this.element.x + this.element.width - inset,
      bottom: this.element.y + this.element.height - inset,
      width: Math.max(10, this.element.width - (inset * 2)), // Ensure minimum width
      height: Math.max(10, this.element.height - (inset * 2)) // Ensure minimum height
    };
  }

  getPerimeterPosition(bounds, progress) {
    // Distribute particles around the perimeter of the element
    const perimeter = (bounds.width + bounds.height) * 2;
    const distance = progress * perimeter;
    
    if (distance <= bounds.width) {
      // Top edge
      return {
        x: bounds.left + distance,
        y: bounds.top
      };
    } else if (distance <= bounds.width + bounds.height) {
      // Right edge
      return {
        x: bounds.right,
        y: bounds.top + (distance - bounds.width)
      };
    } else if (distance <= bounds.width * 2 + bounds.height) {
      // Bottom edge
      return {
        x: bounds.right - (distance - bounds.width - bounds.height),
        y: bounds.bottom
      };
    } else {
      // Left edge
      return {
        x: bounds.left,
        y: bounds.bottom - (distance - bounds.width * 2 - bounds.height)
      };
    }
  }

  update() {
    const now = Date.now();
    const elapsed = now - this.startTime;
    
    if (elapsed >= this.duration) {
      this.completed = true;
      return;
    }

    // Update all particles
    this.particles.forEach(particle => particle.update());
    
    // Remove completed particles
    this.particles = this.particles.filter(particle => !particle.completed);
    
    // Mark effect as completed if no particles remain
    if (this.particles.length === 0) {
      this.completed = true;
    }
  }

  render(ctx) {
    if (this.completed) return;
    
    this.particles.forEach(particle => particle.render(ctx));
  }
}

// Global effects manager (handles both sparkle and poof effects)
class EffectsManager {
  constructor() {
    this.activeEffects = new Map();
    this.animationFrameId = null;
    this.isAnimating = false;
  }

  addSparkleEffect(element) {
    console.log(`Adding sparkle effect for element ${element.id} (${element.type})`);
    
    // Remove any existing effect for this element
    if (this.activeEffects.has(element.id)) {
      this.activeEffects.delete(element.id);
    }
    
    // Create new sparkle effect
    const effect = new ElementSparkleEffect(element);
    this.activeEffects.set(element.id, effect);
    
    // Start animation loop if not already running
    if (!this.isAnimating) {
      this.startAnimation();
    }
  }

  addPoofEffect(element) {
    console.log(`Adding poof effect for element ${element.id} (${element.type})`);
    
    // Remove any existing effect for this element
    if (this.activeEffects.has(element.id)) {
      this.activeEffects.delete(element.id);
    }
    
    // Create new poof effect
    const effect = new ElementPoofEffect(element);
    this.activeEffects.set(element.id, effect);
    
    // Start animation loop if not already running
    if (!this.isAnimating) {
      this.startAnimation();
    }
  }

  startAnimation() {
    if (this.isAnimating) return;
    
    this.isAnimating = true;
    this.animate();
  }

  animate() {
    if (this.activeEffects.size === 0) {
      this.isAnimating = false;
      return;
    }

    // Update all active effects
    for (const [elementId, effect] of this.activeEffects) {
      effect.update();
      
      if (effect.completed) {
        this.activeEffects.delete(elementId);
      }
    }

    // Continue animation if there are still active effects
    if (this.activeEffects.size > 0) {
      this.animationFrameId = requestAnimationFrame(() => this.animate());
    } else {
      this.isAnimating = false;
    }

    // Trigger canvas redraw to show updated particles
    if (dependencies.redrawCanvas) {
      dependencies.redrawCanvas();
    }
  }

  renderAllEffects(ctx) {
    for (const effect of this.activeEffects.values()) {
      effect.render(ctx);
    }
  }

  clearAllEffects() {
    this.activeEffects.clear();
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
    this.isAnimating = false;
  }

  hasActiveEffects() {
    return this.activeEffects.size > 0;
  }
}

// Global instance
const effectsManager = new EffectsManager();

// Public API for sparkle effects
export function addSparkleEffectToElement(element) {
  effectsManager.addSparkleEffect(element);
}

export function addSparkleEffectsToElements(elements) {
  console.log(`Adding sparkle effects to ${elements.length} restored elements`);
  elements.forEach(element => {
    effectsManager.addSparkleEffect(element);
  });
}

// Public API for poof effects
export function addPoofEffectToElement(element) {
  effectsManager.addPoofEffect(element);
}

export function addPoofEffectsToElements(elements) {
  console.log(`Adding poof effects to ${elements.length} deleted elements`);
  elements.forEach(element => {
    effectsManager.addPoofEffect(element);
  });
}

// General effects API
export function renderSparkleEffects(ctx) {
  if (!ctx) return;
  
  ctx.save();
  effectsManager.renderAllEffects(ctx);
  ctx.restore();
}

export function clearAllSparkleEffects() {
  effectsManager.clearAllEffects();
}

export function hasActiveSparkleEffects() {
  return effectsManager.hasActiveEffects();
}

// Initialize the module
export function init() {
  console.log('Sparkle Effects module loaded');
}

// Expose to window for debugging
if (typeof window !== 'undefined') {
  window.sparkleEffects = {
    addSparkleEffectToElement,
    addSparkleEffectsToElements,
    addPoofEffectToElement,
    addPoofEffectsToElements,
    renderSparkleEffects,
    clearAllSparkleEffects,
    hasActiveSparkleEffects
  };
}
(() => {
  'use strict';

  const root = document.getElementById('ahm-root');
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  let motionEnabled = true;

  const motionAllowed = () => motionEnabled && !reducedMotion.matches;
  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

  class HelixRenderer {
    constructor(canvas) {
      this.canvas = canvas;
      this.context = canvas.getContext('2d');
      this.wrapper = canvas.parentElement;
      this.dpr = 1;
      this.rotation = 0;
      this.speed = 1;
      this.lastTime = performance.now();
      this.mouse = { x: 0, y: 0, targetX: 0, targetY: 0 };
      this.frame = null;
      this.destroyed = false;
      this.particles = this.createParticles(34);
      this.resize = this.resize.bind(this);
      this.handleMouse = this.handleMouse.bind(this);
      this.draw = this.draw.bind(this);

      this.resizeObserver = new ResizeObserver(this.resize);
      this.resizeObserver.observe(this.wrapper);
      window.addEventListener('mousemove', this.handleMouse, { passive: true });
      this.resize();
      this.start();
    }

    createParticles(total) {
      let seed = 94037;
      const random = () => {
        seed = (seed * 16807) % 2147483647;
        return (seed - 1) / 2147483646;
      };
      return Array.from({ length: total }, () => ({
        x: random(),
        y: random(),
        radius: .7 + random() * 1.6,
        speed: .35 + random() * .85,
        alpha: .12 + random() * .3,
      }));
    }

    resize() {
      const rect = this.wrapper.getBoundingClientRect();
      this.dpr = Math.min(window.devicePixelRatio || 1, 1.75);
      this.canvas.width = Math.max(2, Math.round(rect.width * this.dpr));
      this.canvas.height = Math.max(2, Math.round(rect.height * this.dpr));
      if (!motionAllowed()) this.render(performance.now(), 0);
    }

    handleMouse(event) {
      this.mouse.targetX = (event.clientX / window.innerWidth - .5) * 2;
      this.mouse.targetY = (event.clientY / window.innerHeight - .5) * 2;
    }

    accent() {
      const hex = getComputedStyle(root).getPropertyValue('--a1').trim() || '#7c5cff';
      const normalized = hex.replace('#', '');
      const value = Number.parseInt(normalized.length === 3
        ? normalized.split('').map((part) => part + part).join('')
        : normalized, 16);
      return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
    }

    start() {
      cancelAnimationFrame(this.frame);
      this.lastTime = performance.now();
      if (motionAllowed()) {
        this.frame = requestAnimationFrame(this.draw);
      } else {
        this.render(this.lastTime, 0);
      }
    }

    draw(now) {
      if (this.destroyed) return;
      const delta = Math.min(48, now - this.lastTime);
      this.lastTime = now;
      this.render(now, delta);
      if (motionAllowed()) this.frame = requestAnimationFrame(this.draw);
    }

    render(_now, delta) {
      const ctx = this.context;
      const width = this.canvas.width;
      const height = this.canvas.height;
      const dpr = this.dpr;
      const accent = this.accent();
      const cyan = [53, 198, 240];

      this.rotation += delta * .00042 * this.speed;
      this.mouse.x += (this.mouse.targetX - this.mouse.x) * .04;
      this.mouse.y += (this.mouse.targetY - this.mouse.y) * .04;
      ctx.clearRect(0, 0, width, height);

      for (const particle of this.particles) {
        if (motionAllowed()) {
          particle.y -= particle.speed * delta * .00002;
          if (particle.y < -.02) particle.y = 1.02;
        }
        ctx.globalAlpha = particle.alpha * .55;
        ctx.fillStyle = 'rgb(205,198,255)';
        ctx.beginPath();
        ctx.arc(particle.x * width, particle.y * height, particle.radius * dpr, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;

      const centerX = width * .56 + this.mouse.x * 28 * dpr;
      const top = height * .07;
      const span = height * .86;
      const radius = Math.min(width * .29, height * .21);
      const turns = 2.4;
      const pointCount = 96;
      const strands = [[], []];

      for (let index = 0; index <= pointCount; index += 1) {
        const progress = index / pointCount;
        const y = top + span * progress;
        const angle = progress * turns * Math.PI * 2 + this.rotation + this.mouse.y * .16;
        for (let strand = 0; strand < 2; strand += 1) {
          const phase = angle + strand * Math.PI;
          const depth = Math.sin(phase);
          const perspective = 1 / (1 + depth * .35);
          const tilt = this.mouse.y * 24 * dpr * (progress - .5);
          const x = centerX + Math.cos(phase) * radius * perspective + tilt;
          strands[strand].push({ x, y, depth });
        }
      }

      for (let index = 0; index <= pointCount; index += 8) {
        const left = strands[0][index];
        const right = strands[1][index];
        const depth = (2 - (left.depth + 1 + right.depth + 1) / 2) / 2;
        const gradient = ctx.createLinearGradient(left.x, left.y, right.x, right.y);
        gradient.addColorStop(0, `rgba(${accent.join(',')},${.06 + .22 * depth})`);
        gradient.addColorStop(1, `rgba(${cyan.join(',')},${.06 + .22 * depth})`);
        ctx.strokeStyle = gradient;
        ctx.lineWidth = (.7 + depth * 1.3) * dpr;
        ctx.beginPath();
        ctx.moveTo(left.x, left.y);
        ctx.lineTo(right.x, right.y);
        ctx.stroke();
      }

      const points = strands.flatMap((strand, strandIndex) =>
        strand.map((point) => ({ ...point, strandIndex })),
      ).sort((a, b) => b.depth - a.depth);

      for (const point of points) {
        const depth = (1 - point.depth) / 2;
        const color = point.strandIndex === 0 ? accent : cyan;
        const alpha = .22 + .68 * depth;
        const dotRadius = (1.1 + 2.3 * depth) * dpr;
        if (depth > .78) {
          ctx.shadowBlur = 13 * dpr;
          ctx.shadowColor = `rgba(${color.join(',')},.85)`;
        }
        ctx.fillStyle = `rgba(${color.join(',')},${alpha})`;
        ctx.beginPath();
        ctx.arc(point.x, point.y, dotRadius, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
      }
    }

    setSpeed(speed) {
      this.speed = clamp(Number(speed) || 0, 0, 2);
    }

    destroy() {
      this.destroyed = true;
      cancelAnimationFrame(this.frame);
      this.resizeObserver.disconnect();
      window.removeEventListener('mousemove', this.handleMouse);
    }
  }

  const initializeNav = () => {
    const nav = document.getElementById('ahm-nav');
    const toggle = nav?.querySelector('.nav-toggle');
    const links = nav?.querySelector('.nav-links');
    if (!nav || !toggle || !links) return () => {};

    const update = () => nav.classList.toggle('is-scrolled', window.scrollY > 40);
    const close = () => {
      links.classList.remove('is-open');
      toggle.setAttribute('aria-expanded', 'false');
      document.body.classList.remove('nav-open');
    };
    const onToggle = () => {
      const open = toggle.getAttribute('aria-expanded') !== 'true';
      toggle.setAttribute('aria-expanded', String(open));
      links.classList.toggle('is-open', open);
      document.body.classList.toggle('nav-open', open);
    };

    update();
    toggle.addEventListener('click', onToggle);
    links.querySelectorAll('a').forEach((link) => link.addEventListener('click', close));
    return { update, close };
  };

  const initializeReveals = () => {
    const elements = [...document.querySelectorAll('[data-reveal]')];
    if (!motionAllowed() || !('IntersectionObserver' in window)) return { disconnect() {} };

    elements
      .filter((element) => element.getBoundingClientRect().top > window.innerHeight * .92)
      .forEach((element) => element.classList.add('reveal-pending'));

    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        const element = entry.target;
        element.style.setProperty('--reveal-delay', `${Number.parseInt(element.dataset.rdelay || '0', 10)}ms`);
        element.classList.remove('reveal-pending');
        element.classList.add('reveal-visible');
        observer.unobserve(element);
      });
    }, { threshold: .12 });

    elements.filter((element) => element.classList.contains('reveal-pending')).forEach((element) => observer.observe(element));
    return observer;
  };

  const setCountsFinal = () => {
    document.querySelectorAll('[data-count]').forEach((element) => {
      element.textContent = `${element.dataset.count}${element.dataset.suffix || ''}`;
    });
  };

  const initializeCounts = () => {
    const elements = [...document.querySelectorAll('[data-count]')];
    if (!motionAllowed() || !('IntersectionObserver' in window)) {
      setCountsFinal();
      return { disconnect() {} };
    }

    const animate = (element) => {
      const target = Number.parseInt(element.dataset.count || '0', 10);
      const suffix = element.dataset.suffix || '';
      const start = performance.now();
      const step = (now) => {
        const progress = Math.min(1, (now - start) / 1100);
        const eased = 1 - (1 - progress) ** 3;
        element.textContent = `${Math.round(eased * target)}${suffix}`;
        if (progress < 1 && motionAllowed()) requestAnimationFrame(step);
        else element.textContent = `${target}${suffix}`;
      };
      requestAnimationFrame(step);
    };

    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        animate(entry.target);
        observer.unobserve(entry.target);
      });
    }, { threshold: .5 });
    elements.forEach((element) => observer.observe(element));
    return observer;
  };

  const terminalLines = [
    { command: 'gh workflow run update-visual-baselines.yml -f reason="seed baselines"', output: 'dispatched — opens a PR with canonical visual baselines' },
    { command: 'gh workflow run ahm-execution-helix.yml -f platform=web', output: 'Execution Helix queued — playwright · pixelmatch' },
    { command: 'gh workflow run ahm-execution-helix.yml -f platform=perf -f perf_users=30 -f perf_duration=60', output: 'gatling resonance run queued — metrics stream to the BDD layer' },
  ];

  const terminalMarkup = (done, current = null, cursor = false) => {
    const completed = done.map((line) =>
      `<span class="prompt">$ </span><span class="terminal-command">${line.command}</span>\n<span class="terminal-success">✓</span> <span class="terminal-output">${line.output}</span>\n`,
    ).join('');
    if (current === null) return completed;
    return `${completed}<span class="prompt">$ </span><span class="terminal-command">${current}</span>${cursor ? '<span class="terminal-cursor" aria-hidden="true"></span>' : ''}`;
  };

  const fillTerminal = () => {
    const terminal = document.getElementById('ahm-term');
    if (terminal) terminal.innerHTML = terminalMarkup(terminalLines, '', true);
  };

  const initializeTerminal = () => {
    const terminal = document.getElementById('ahm-term');
    if (!terminal) return { disconnect() {} };
    if (!motionAllowed() || !('IntersectionObserver' in window)) {
      fillTerminal();
      return { disconnect() {} };
    }

    let started = false;
    const sleep = (milliseconds) => new Promise((resolve) => window.setTimeout(resolve, milliseconds));
    const type = async () => {
      const done = [];
      for (const line of terminalLines) {
        let current = '';
        for (const character of line.command) {
          if (!motionAllowed()) return fillTerminal();
          current += character;
          terminal.innerHTML = terminalMarkup(done, current, true);
          await sleep(14 + Math.random() * 22);
        }
        await sleep(300);
        done.push(line);
        terminal.innerHTML = terminalMarkup(done);
        await sleep(420);
      }
      terminal.innerHTML = terminalMarkup(done, '', true);
    };

    const observer = new IntersectionObserver((entries) => {
      if (started || !entries.some((entry) => entry.isIntersecting)) return;
      started = true;
      type();
      observer.disconnect();
    }, { threshold: .35 });
    observer.observe(terminal);
    return observer;
  };

  const initializeParallax = (navController) => {
    const elements = [...document.querySelectorAll('[data-par]')];
    const offsets = new WeakMap();
    elements.forEach((element) => offsets.set(element, 0));
    let ticking = false;

    const update = () => {
      navController.update();
      if (!motionAllowed()) return;
      const viewportCenter = window.innerHeight / 2;
      elements.forEach((element) => {
        const previous = offsets.get(element) || 0;
        const rect = element.getBoundingClientRect();
        const factor = Number.parseFloat(element.dataset.par || '0');
        const rawTop = rect.top - previous;
        const offset = (rawTop + rect.height / 2 - viewportCenter) * factor;
        offsets.set(element, offset);
        element.style.transform = `translate3d(0, ${offset.toFixed(1)}px, 0)`;
      });
    };

    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        ticking = false;
        update();
      });
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    update();
    return { update, destroy: () => window.removeEventListener('scroll', onScroll) };
  };

  const navController = initializeNav();
  let revealObserver = initializeReveals();
  let countObserver = initializeCounts();
  let terminalObserver = initializeTerminal();
  const helix = new HelixRenderer(document.getElementById('ahm-helix'));
  const parallax = initializeParallax(navController);

  const setMotion = (enabled) => {
    motionEnabled = Boolean(enabled);
    root.classList.toggle('motion-disabled', !motionAllowed());
    revealObserver.disconnect();
    countObserver.disconnect();
    terminalObserver.disconnect();
    document.querySelectorAll('[data-reveal]').forEach((element) => {
      element.classList.remove('reveal-pending');
      element.classList.add('reveal-visible');
    });
    if (!motionAllowed()) {
      setCountsFinal();
      fillTerminal();
    }
    helix.start();
    parallax.update();
  };

  const setAccent = (hex) => {
    if (!/^#[0-9a-f]{6}$/i.test(hex)) return false;
    const value = Number.parseInt(hex.slice(1), 16);
    const red = (value >> 16) & 255;
    const green = (value >> 8) & 255;
    const blue = value & 255;
    root.style.setProperty('--a1', hex);
    root.style.setProperty('--a1-glow', `rgba(${red},${green},${blue},.18)`);
    root.style.setProperty('--a1-soft', `rgba(${red},${green},${blue},.12)`);
    root.style.setProperty('--a1-line', `rgba(${red},${green},${blue},.45)`);
    root.style.setProperty('--a1-chip', `rgba(${red},${green},${blue},.10)`);
    if (!motionAllowed()) helix.render(performance.now(), 0);
    return true;
  };

  reducedMotion.addEventListener('change', () => setMotion(motionEnabled));
  window.ahmLanding = {
    setMotion,
    setHelixSpeed: (speed) => helix.setSpeed(speed),
    setAccent,
  };

  window.addEventListener('pagehide', () => {
    revealObserver.disconnect();
    countObserver.disconnect();
    terminalObserver.disconnect();
    parallax.destroy();
    helix.destroy();
  }, { once: true });
})();

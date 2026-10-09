// Landing Page Script
import {
  addDoc,
  collection,
  serverTimestamp
} from 'https://www.gstatic.com/firebasejs/12.15.0/firebase-firestore.js';
import { auth, db } from './firebase-config.js';

document.addEventListener('DOMContentLoaded', function () {
  // ==========================================
  // DARK / LIGHT THEME TOGGLE
  // ==========================================
  const themeToggleBtn = document.getElementById('themeToggleBtn');
  const themeToggleIcon = document.getElementById('themeToggleIcon');

  function updateThemeUI(isDark) {
    if (isDark) {
      document.documentElement.classList.add('dark-mode');
      document.body.classList.add('dark-mode');
      if (themeToggleIcon) {
        themeToggleIcon.className = 'fas fa-sun';
      }
      if (themeToggleBtn) {
        themeToggleBtn.setAttribute('aria-label', 'Switch to Light Mode');
        themeToggleBtn.setAttribute('title', 'Switch to Light Mode');
      }
    } else {
      document.documentElement.classList.remove('dark-mode');
      document.body.classList.remove('dark-mode');
      if (themeToggleIcon) {
        themeToggleIcon.className = 'fas fa-moon';
      }
      if (themeToggleBtn) {
        themeToggleBtn.setAttribute('aria-label', 'Switch to Dark Mode');
        themeToggleBtn.setAttribute('title', 'Switch to Dark Mode');
      }
    }
  }

  let savedTheme = null;
  try {
    savedTheme = localStorage.getItem('theme');
  } catch (err) {
    console.warn('Could not read saved theme preference:', err);
  }
  const isDarkMode = savedTheme === 'dark';
  updateThemeUI(isDarkMode);

  if (themeToggleBtn) {
    themeToggleBtn.addEventListener('click', function () {
      const isCurrentlyDark = document.body.classList.contains('dark-mode') || document.documentElement.classList.contains('dark-mode');
      const nextDark = !isCurrentlyDark;
      updateThemeUI(nextDark);
      try {
        localStorage.setItem('theme', nextDark ? 'dark' : 'light');
      } catch (err) {
        console.error('Could not save theme preference to localStorage:', err);
      }
    });
  }

  // Accessible compact navigation and in-page scrolling.
  const mobileMenuToggle = document.getElementById('mobileMenuToggle');
  const mobileNavigation = document.getElementById('landingNavigation');
  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function closeMobileNavigation() {
    if (!mobileMenuToggle || !mobileNavigation) return;
    mobileNavigation.classList.remove('is-open');
    mobileMenuToggle.setAttribute('aria-expanded', 'false');
    mobileMenuToggle.setAttribute('aria-label', 'Open navigation menu');
  }

  mobileMenuToggle?.addEventListener('click', () => {
    const isOpen = mobileMenuToggle.getAttribute('aria-expanded') === 'true';
    mobileMenuToggle.setAttribute('aria-expanded', String(!isOpen));
    mobileMenuToggle.setAttribute('aria-label', isOpen ? 'Open navigation menu' : 'Close navigation menu');
    mobileNavigation?.classList.toggle('is-open', !isOpen);
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && mobileMenuToggle?.getAttribute('aria-expanded') === 'true') {
      closeMobileNavigation();
      mobileMenuToggle.focus();
    }
  });

  document.querySelectorAll('a[href^="#"]').forEach((link) => {
    const href = link.getAttribute('href');
    if (!href || href === '#') return;
    const targetElement = document.getElementById(decodeURIComponent(href.slice(1)));
    if (!targetElement) return;

    link.addEventListener('click', (event) => {
      event.preventDefault();
      targetElement.scrollIntoView({ behavior: prefersReducedMotion ? 'auto' : 'smooth' });
      closeMobileNavigation();
    });
  });

  document.getElementById('currentYear')?.replaceChildren(String(new Date().getFullYear()));

  const heroVideo = document.querySelector('.hero-video');
  if (heroVideo) {
    if (prefersReducedMotion) {
      heroVideo.pause();
    } else {
      // Alternate between the still poster and each complete video playback.
      let videoStarted = false;
      const startHeroVideo = () => {
        if (videoStarted) return;
        videoStarted = true;
        window.setTimeout(async () => {
          try {
            await heroVideo.play();
            heroVideo.classList.add('is-visible');
          } catch (err) {
            // Keep the poster visible when autoplay is blocked by the browser.
          }
        }, 4000);
      };

      heroVideo.addEventListener('ended', () => {
        heroVideo.classList.remove('is-visible');
        window.setTimeout(() => {
          heroVideo.currentTime = 0;
          heroVideo.play().then(() => {
            heroVideo.classList.add('is-visible');
          }).catch(() => {
            // Keep the poster visible if playback cannot resume.

          });
        }, 4000);
      });

      if (heroVideo.readyState >= HTMLMediaElement.HAVE_FUTURE_DATA) {
        startHeroVideo();
      } else {
        heroVideo.addEventListener('canplay', startHeroVideo, { once: true });
      }
    }
  }

  // ==========================================
  // ROLES TABS LOGIC
  // ==========================================
  const roleTabs = document.querySelectorAll('.role-tab');
  const rolePanels = document.querySelectorAll('.role-panel');

  roleTabs.forEach(tab => {
    tab.addEventListener('click', () => {
      // Deactivate all
      roleTabs.forEach(t => {
        t.classList.remove('active');
        t.setAttribute('aria-selected', 'false');
      });
      rolePanels.forEach(p => {
        p.classList.remove('active');
        p.hidden = true;
      });

      // Activate clicked
      tab.classList.add('active');
      tab.setAttribute('aria-selected', 'true');
      const panelId = tab.getAttribute('aria-controls');
      const targetPanel = document.getElementById(panelId);
      if (targetPanel) {
        targetPanel.classList.add('active');
        targetPanel.hidden = false;
      }
    });
  });

  // ==========================================
  // SCROLL ANIMATIONS
  // ==========================================
  const observerOptions = {
    threshold: 0.1,
    rootMargin: '0px 0px -50px 0px'
  };

  const observer = 'IntersectionObserver' in window ? new IntersectionObserver(function (entries) {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('in-view');
        observer.unobserve(entry.target);
      }
    });
  }, observerOptions) : null;

  document.querySelectorAll('.slide-up-anim').forEach(el => {
    observer?.observe(el);
  });


  // ==========================================
  // FAQ ACCORDION LOGIC
  // ==========================================
  const faqQuestions = document.querySelectorAll('.faq-question');

  faqQuestions.forEach(question => {
    const answerId = question.getAttribute('aria-controls');
    const controlledAnswer = answerId ? document.getElementById(answerId) : null;
    question.addEventListener('click', function () {
      const faqItem = this.parentElement;
      const faqContent = controlledAnswer || faqItem.querySelector('.faq-content');
      const isActive = faqItem.classList.contains('active');

      // Close all other active FAQ items
      document.querySelectorAll('.faq-item').forEach(item => {
        if (item !== faqItem) {
          item.classList.remove('active');
          const content = item.querySelector('.faq-content');
          if (content) content.style.maxHeight = null;
          item.querySelector('.faq-question')?.setAttribute('aria-expanded', 'false');
        }
      });

      // Toggle current FAQ item
      if (isActive) {
        faqItem.classList.remove('active');
        faqContent.style.maxHeight = null;
        this.setAttribute('aria-expanded', 'false');
      } else {
        faqItem.classList.add('active');
        faqContent.style.maxHeight = faqContent.scrollHeight + "px";
        this.setAttribute('aria-expanded', 'true');
      }
    });
  });

  // ==========================================
  // CONTACT FORM VALIDATION & SUBMISSION
  // ==========================================
  const contactForm = document.getElementById('landing-contact-form');
  const contactContainer = contactForm?.closest('.contact-form-container');

  if (contactForm && contactContainer) {
    contactForm.addEventListener('submit', async function (e) {
      e.preventDefault();

      const name = document.getElementById('contact-name').value.trim();
      const email = document.getElementById('contact-email').value.trim();
      const subject = document.getElementById('contact-subject').value.trim();
      const message = document.getElementById('contact-message').value.trim();

      if (!name || !email || !subject || !message) {
        alert("Please fill in all required fields.");
        return;
      }

      // Simple email validation regex
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        alert("Please enter a valid email address.");
        return;
      }

      const submitButton = contactForm.querySelector('button[type="submit"]');
      const originalButtonContent = submitButton.innerHTML;

      const currentUser = auth.currentUser;

      submitButton.disabled = true;
      submitButton.setAttribute('aria-busy', 'true');
      submitButton.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Sending...';

      try {
        const contactMessage = {
          name,
          email,
          subject,
          message,
          status: 'new',
          source: 'landing-page',
          createdAt: serverTimestamp()
        };
        if (currentUser?.uid) contactMessage.senderId = currentUser.uid;
        await addDoc(collection(db, 'contactMessages'), contactMessage);

        contactContainer.style.transition = 'opacity 0.3s ease';
        contactContainer.style.opacity = 0;

        setTimeout(() => {
          contactContainer.innerHTML = `
          <div class="contact-success-card animate__animated animate__fadeIn" role="status" aria-live="polite">
            <i class="fas fa-circle-check"></i>
            <h3>Message Sent!</h3>
            <p>Thank you, <strong>${escapeHTML(name)}</strong>. Your message has been submitted.</p>
          </div>
        `;
          contactContainer.style.opacity = 1;
        }, 300);
      } catch (error) {
        console.error('Error sending contact message:', error);
        alert('Your message could not be sent. Please try again later.');
        submitButton.disabled = false;
        submitButton.removeAttribute('aria-busy');
        submitButton.innerHTML = originalButtonContent;
      }
    });
  }

  // Utility to escape HTML and prevent XSS
  function escapeHTML(str) {
    return str.replace(/[&<>'"]/g,
      tag => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        "'": '&#39;',
        '"': '&quot;'
      }[tag] || tag)
    );
  }
});

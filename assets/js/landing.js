// Landing Page Script
import { bloodInventoryManager } from './inventory.js';
import {
  addDoc,
  collection,
  serverTimestamp
} from 'https://www.gstatic.com/firebasejs/12.15.0/firebase-firestore.js';
import { auth, db } from './firebase-config.js';

document.addEventListener('DOMContentLoaded', function() {
  // Smooth scrolling for navigation links
  const navLinks = document.querySelectorAll('a[href^="#"]');
  
  navLinks.forEach(link => {
    link.addEventListener('click', function(e) {
      e.preventDefault();
      const targetId = this.getAttribute('href');
      if (targetId === '#') return;
      
      const targetElement = document.querySelector(targetId);
      if (targetElement) {
        targetElement.scrollIntoView({ behavior: 'smooth' });
      }
    });
  });

  // Add animation to cards on scroll
  const observerOptions = {
    threshold: 0.1,
    rootMargin: '0px 0px -100px 0px'
  };

  const observer = new IntersectionObserver(function(entries) {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.style.animation = 'slideIn 0.6s ease forwards';
        observer.unobserve(entry.target);
      }
    });
  }, observerOptions);

  // Observe feature cards
  document.querySelectorAll('.feature-card').forEach(card => {
    observer.observe(card);
  });

  // Observe role cards
  document.querySelectorAll('.role-card').forEach(card => {
    observer.observe(card);
  });

  // Observe contact items
  document.querySelectorAll('.contact-item').forEach(item => {
    observer.observe(item);
  });

  // Observe FAQ Accordion items
  document.querySelectorAll('.faq-item').forEach(item => {
    observer.observe(item);
  });

  // ==========================================
  // QUICK BLOOD SEARCH LOGIC
  // ==========================================
  const searchForm = document.getElementById('quick-search-form');
  const resultsContainer = document.getElementById('search-results');

  if (searchForm && resultsContainer) {
    searchForm.addEventListener('submit', async function(e) {
      e.preventDefault();
      
      const bloodGroup = document.getElementById('search-blood-group').value;
      const city = document.getElementById('search-city').value.trim();
      
      if (!bloodGroup || !city) return;

      // Show skeleton loader
      resultsContainer.innerHTML = `
        <div class="skeleton-loader">
          <div class="skeleton-item"></div>
          <div class="skeleton-item"></div>
        </div>
      `;

      // Small artificial delay for visual feedback
      await new Promise(resolve => setTimeout(resolve, 800));

      try {
        const result = await bloodInventoryManager.searchBloodAvailability(bloodGroup, city);
        if (result.success && result.data && result.data.length > 0) {
          renderSearchResults(result.data);
        } else {
          renderEmptyState(bloodGroup, city, false);
        }
      } catch (error) {
        console.error("Search error, falling back:", error);
        renderEmptyState(bloodGroup, city, true);
      }
    });
  }

  function renderSearchResults(items) {
    let html = '<div class="result-list">';
    items.forEach(item => {
      html += `
        <div class="result-item animate__animated animate__fadeInUp">
          <div class="result-item-header">
            <span class="result-org-name">${escapeHTML(item.organizationName)}</span>
            <span class="result-badge">
              <i class="fas fa-droplet"></i> ${escapeHTML(item.bloodGroup)}: ${item.units} Units
            </span>
          </div>
          <div class="result-details">
            <div><i class="fas fa-map-marker-alt"></i> <span>${escapeHTML(item.address)}</span></div>
            <div><i class="fas fa-phone"></i> <span>${escapeHTML(item.phone)}</span></div>
          </div>
          <div class="result-action">
            <a href="pages/auth/login.html" class="btn btn-secondary btn-sm">Request Blood</a>
          </div>
        </div>
      `;
    });
    html += '</div>';
    resultsContainer.innerHTML = html;
  }

  function renderEmptyState(bloodGroup, city, isError) {
    resultsContainer.innerHTML = `
      <div class="search-empty animate__animated animate__fadeIn">
        <i class="fas fa-circle-info"></i>
        <h4>No Results Found</h4>
        <p>No active units of <strong>${escapeHTML(bloodGroup)}</strong> were found in <strong>${escapeHTML(city)}</strong>.</p>
        <button id="show-demo-btn" class="btn btn-primary btn-sm">Show Demo Results</button>
      </div>
    `;

    const demoBtn = document.getElementById('show-demo-btn');
    if (demoBtn) {
      demoBtn.addEventListener('click', function() {
        const mockData = [
          {
            organizationName: "City Blood Bank",
            bloodGroup: bloodGroup,
            units: 18,
            phone: "+1 (555) 019-2834",
            address: `456 Healthcare Blvd, ${city}`
          },
          {
            organizationName: "Mercy General Blood Depot",
            bloodGroup: bloodGroup,
            units: 8,
            phone: "+1 (555) 014-9988",
            address: `789 Hospital Lane, ${city}`
          }
        ];
        renderSearchResults(mockData);
      });
    }
  }

  // ==========================================
  // FAQ ACCORDION LOGIC
  // ==========================================
  const faqQuestions = document.querySelectorAll('.faq-question');
  
  faqQuestions.forEach(question => {
    question.addEventListener('click', function() {
      const faqItem = this.parentElement;
      const faqContent = faqItem.querySelector('.faq-content');
      const isActive = faqItem.classList.contains('active');
      
      // Close all other active FAQ items
      document.querySelectorAll('.faq-item').forEach(item => {
        if (item !== faqItem) {
          item.classList.remove('active');
          const content = item.querySelector('.faq-content');
          if (content) content.style.maxHeight = null;
        }
      });
      
      // Toggle current FAQ item
      if (isActive) {
        faqItem.classList.remove('active');
        faqContent.style.maxHeight = null;
      } else {
        faqItem.classList.add('active');
        faqContent.style.maxHeight = faqContent.scrollHeight + "px";
      }
    });
  });

  // ==========================================
  // CONTACT FORM VALIDATION & SUBMISSION
  // ==========================================
  const contactForm = document.getElementById('landing-contact-form');
  const contactContainer = document.querySelector('.contact-form-container');

  if (contactForm && contactContainer) {
    contactForm.addEventListener('submit', async function(e) {
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
      if (!currentUser) {
        alert('Please sign in before sending a message.');
        return;
      }

      submitButton.disabled = true;
      submitButton.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Sending...';

      try {
        await addDoc(collection(db, 'contactMessages'), {
          name,
          email,
          subject,
          message,
          senderId: currentUser.uid,
          status: 'new',
          source: 'landing-page',
          createdAt: serverTimestamp()
        });

        contactContainer.style.transition = 'opacity 0.3s ease';
        contactContainer.style.opacity = 0;

        setTimeout(() => {
        contactContainer.innerHTML = `
          <div class="contact-success-card animate__animated animate__fadeIn">
            <i class="fas fa-circle-check"></i>
            <h3>Message Sent!</h3>
            <p>Thank you, <strong>${escapeHTML(name)}</strong>. Your message has been sent to our admin team. We will get back to you at <strong>${escapeHTML(email)}</strong> shortly.</p>
          </div>
        `;
        contactContainer.style.opacity = 1;
      }, 300);
      } catch (error) {
        console.error('Error sending contact message:', error);
        const errorMessage = error?.code === 'permission-denied'
          ? 'Message sending is not authorized by Firestore rules. Please contact the administrator.'
          : `Your message could not be sent: ${error?.message || 'Unknown error'}`;
        alert(errorMessage);
        submitButton.disabled = false;
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

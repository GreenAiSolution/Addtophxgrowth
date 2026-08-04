// Smooth scrolling for navigation links
document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function (e) {
        e.preventDefault();
        const target = document.querySelector(this.getAttribute('href'));
        if (target) {
            target.scrollIntoView({ behavior: 'smooth' });
        }
    });
});

// Product card interactions
const productBtns = document.querySelectorAll('.product-btn');
productBtns.forEach(btn => {
    btn.addEventListener('click', function() {
        const productName = this.closest('.product-card').querySelector('.product-name').textContent;
        alert(`Check out the ${productName}! Coming soon: Full product details and ordering system.`);
    });
});

// Custom order CTA
const ctaButton = document.querySelector('.cta-button');
if (ctaButton) {
    ctaButton.addEventListener('click', function() {
        const contactSection = document.getElementById('contact');
        contactSection.scrollIntoView({ behavior: 'smooth' });
        document.querySelector('.contact-form textarea').focus();
    });
}

// Contact form submission
const contactForm = document.querySelector('.contact-form');
if (contactForm) {
    contactForm.addEventListener('submit', function(e) {
        e.preventDefault();

        const name = this.querySelector('input[type="text"]').value;
        const email = this.querySelector('input[type="email"]').value;
        const message = this.querySelector('textarea').value;

        // Simulate form submission
        console.log('Form submitted:', { name, email, message });

        // Show success message
        alert(`Thanks for reaching out, ${name}! We'll be in touch soon at ${email}. Can't wait to create something amazing with you! ✨`);

        // Reset form
        this.reset();
    });
}

// Add scroll animation for sections
const observerOptions = {
    threshold: 0.1,
    rootMargin: '0px 0px -50px 0px'
};

const observer = new IntersectionObserver(function(entries) {
    entries.forEach(entry => {
        if (entry.isIntersecting) {
            entry.target.style.animation = 'fadeInUp 0.6s ease-out forwards';
            observer.unobserve(entry.target);
        }
    });
}, observerOptions);

// Observe all cards and sections
document.querySelectorAll('.product-card, .gallery-item, .info-box').forEach(el => {
    el.style.opacity = '0';
    observer.observe(el);
});

// Add parallax effect on scroll
window.addEventListener('scroll', function() {
    const hero = document.querySelector('.hero');
    const scrolled = window.pageYOffset;
    if (hero) {
        hero.style.backgroundPosition = `0px ${scrolled * 0.5}px`;
    }
});

// Mobile menu toggle (if you add a hamburger menu later)
function initMobileMenu() {
    const navLinks = document.querySelector('.nav-links');
    const hamburger = document.querySelector('.hamburger');

    if (hamburger) {
        hamburger.addEventListener('click', function() {
            navLinks.style.display = navLinks.style.display === 'flex' ? 'none' : 'flex';
        });
    }
}

initMobileMenu();

// Image loading simulation
window.addEventListener('load', function() {
    console.log('Website loaded! Ready for Demi\'s custom creations ✨');
});

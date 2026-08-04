# 👑 Demi's Custom Closet - Website

A stunning, modern e-commerce website for a custom clothing and jewelry brand. Built with creative design and smooth interactions.

## Features

✨ **Design Highlights:**
- Bold, eye-catching hero section with gradient overlays
- Modern color palette (gold, blush, sage, cream accents)
- Responsive grid layouts
- Smooth animations and transitions
- Mobile-friendly design
- Gallery showcase for client creations
- Custom order call-to-action section
- Contact form integration

## What's Included

### Files:
- `index.html` - Main website structure
- `styles.css` - Modern, responsive styling
- `script.js` - Interactive animations and form handling

## Color Scheme

The website uses a luxurious, creative color palette:
- **Dark** (#1a1a1a) - Primary text and backgrounds
- **Gold** (#d4af37) - Accent and highlights
- **Blush** (#ffd7e0) - Secondary accent
- **Cream** (#fffef9) - Light backgrounds
- **Sage** (#9ca89d) - Muted text
- **Accent** (#ff6b9d) - Primary brand color

## Sections

1. **Navigation** - Sticky header with navigation links
2. **Hero** - Bold title and brand statement
3. **Featured Products** - 4-item product grid
4. **Custom Orders** - CTA section for custom pieces
5. **Gallery** - Client creations showcase
6. **About** - Brand story
7. **Contact** - Email form and social links
8. **Footer** - Brand info and copyright

## How to Use

### Local Development
1. Open `index.html` in your browser
2. No build process or dependencies needed
3. All styling and interactivity works immediately

### Customization

**Update Brand Name:**
- Change "DEMI'S" to your brand name throughout files

**Add Real Products:**
- Edit product names and prices in the product grid
- Update product image placeholders with actual images

**Custom Colors:**
Replace color values in `styles.css` `:root` section:
```css
:root {
    --dark: #your-color;
    --gold: #your-color;
    /* etc... */
}
```

**Add Real Images:**
Replace gradient backgrounds in `.product-image` classes:
```css
.product-image.sequin {
    background-image: url('path/to/image.jpg');
    background-size: cover;
}
```

**Update Contact Info:**
- Email: Search for "hello@demiscloset.com" in index.html
- Location: Update Phoenix, Arizona
- Social links: Add real Instagram/TikTok URLs

## Deployment Options

### Quick & Free Options:
1. **Netlify** - Drag & drop the folder
2. **Vercel** - Connect your repo
3. **GitHub Pages** - Push to gh-pages branch
4. **Replit** - Upload files directly

### With E-commerce:
- **Shopify** - Use this as design inspiration
- **WooCommerce** - WordPress integration
- **Stripe** - Add payment processing

## Adding E-commerce Features

To add a shopping cart and payment:
1. Integrate Stripe payment processing
2. Add product database (Firebase/Supabase)
3. Implement shopping cart functionality
4. Connect email notifications

Example integration coming soon!

## Browser Support

- Chrome (latest)
- Firefox (latest)
- Safari (latest)
- Edge (latest)
- Mobile browsers

## Performance Tips

- Optimize product images (use .webp format)
- Lazy load gallery images
- Enable compression
- Use CDN for assets

## Fonts

Currently using system fonts. To add custom fonts:
```html
<link href="https://fonts.googleapis.com/css2?family=YOUR-FONT&display=swap" rel="stylesheet">
```

Then update font-family in CSS.

## Next Steps

1. ✅ Design and layout complete
2. 📸 Add real product photos
3. 💳 Integrate payment processing
4. 📧 Set up email notifications
5. 📱 Test on mobile devices
6. 🚀 Deploy to hosting

## Support

- Need to add more products? Duplicate the product-card HTML
- Want different layouts? Modify CSS Grid properties
- Custom features? Edit JavaScript in script.js

---

**Made with ✨ for Demi's Custom Closet**

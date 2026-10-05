(function () {
  const mount = document.getElementById("site-footer");
  if (!mount) return;

  const footerHtml = `<footer id="footer" class="classic-underline-effect">
  <div class="upper-footer">
    <div class="container">
      <div class="footer-bar">
        <div class="footer-nav-menu">
          <ul class="navbar-footer">
            <li><a href="index.html">Home</a></li>
            <li><a href="services.html">Services</a></li>
            <li><a href="about-us.html">About Digital Wealth Partners</a></li>
            <li><a href="contact.html">Contact us</a></li>
          </ul>
        </div>
      </div>

      <div class="footer-widget-area">
        <div class="footer-widget-column first-widget-area">
          <div class="footer_widget widget_text">
            <div class="textwidget">
              <p class="footer-brand-desc">Digital Wealth Partners is An SEC-registered investment adviser providing fiduciary guidance on digital assets and traditional wealth management. Based in Dallas, Texas.</p>
            </div>
          </div>
          <div class="footer_widget widget_text">
            <div class="textwidget">
              <p>
                <a href="disclaimer.html">Disclaimer</a> |
                <a href="privacy-policy.html">Privacy Policy</a> |
                <a href="terms-of-service.html">Terms of Service</a> |
                <a href="legal.html">Legal</a> |
                <a href="refund-policy.html">Onboarding Fee Refund Policy</a>
              </p>
            </div>
          </div>
        </div>

        <div class="footer-widget-column third-widget-area">
          <div class="footer_widget widget_nav_menu">
            <h5 class="widget-title"><span>Quick Links</span></h5>
            <ul class="menu">
              <li><a href="about-us.html">Who We Serve</a></li>
              <li><a href="services.html">What We Do</a></li>
            </ul>
          </div>
        </div>

        <div class="footer-widget-column fourth-widget-area">
          <div class="footer_widget widget_nav_menu">
            <h5 class="widget-title"><span>Key Services</span></h5>
            <ul class="menu">
              <li><a href="digital-asset-custody.html">Crypto Custody</a></li>
              <li><a href="services.html">Crypto Wealth Management</a></li>
              <li><a href="services.html">Crypto Lending</a></li>
            </ul>
          </div>
        </div>

        <div class="footer-widget-column fifth-widget-area">
          <div class="footer_widget widget_text">
            <div class="textwidget">
              <p><strong><a href="https://adviserinfo.sec.gov/" target="_blank" rel="noopener">IAPD – Investment Advisor Public Disclosure</a></strong></p>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>

  <div class="lower-footer copyright-center">
    <div class="container">
      <span>© 2026 <a href="index.html">Digital Wealth Partners</a> - All Rights Reserved</span>
    </div>
  </div>
</footer>`;

  mount.outerHTML = footerHtml;
})();

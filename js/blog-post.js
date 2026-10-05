(function () {
  "use strict";

  var POSTS = window.DWP_BLOG_POSTS || [];

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function getPostId() {
    return new URLSearchParams(window.location.search).get("id") || "";
  }

  document.addEventListener("DOMContentLoaded", function () {
    var id = getPostId();
    var post = POSTS.find(function (p) {
      return p.id === id;
    });
    var main = document.getElementById("blog-post-main");
    if (!main) return;

    if (!post) {
      main.innerHTML =
        '<p class="blog-no-results">Post not found. <a href="blog.html">Return to the blog</a>.</p>';
      document.title = "Post Not Found | Digital Wealth Partners";
      return;
    }

    document.title = post.title + " | Digital Wealth Partners";

    var imageHtml = post.image
      ? '<div class="entry-image"><img src="' +
        post.image +
        '" alt="' +
        escapeHtml(post.title) +
        '" width="800" height="418"></div>'
      : "";

    var bodyHtml = (post.body || [])
      .map(function (p) {
        return "<p>" + escapeHtml(p) + "</p>";
      })
      .join("");

    main.innerHTML =
      '<article class="post blog-post-single">' +
      imageHtml +
      '<div class="entry-meta">' +
      '<span class="published"><i class="bi bi-clock" aria-hidden="true"></i><span>' +
      escapeHtml(post.date) +
      "</span></span>" +
      '<span class="author"><i class="bi bi-person" aria-hidden="true"></i><a href="about-us.html">Digital Wealth Partners</a></span>' +
      '<span class="blog-label"><i class="bi bi-folder" aria-hidden="true"></i><span>' +
      escapeHtml(post.category) +
      "</span></span>" +
      '<span class="comment-count"><i class="bi bi-chat" aria-hidden="true"></i><span>Comments Off</span></span>' +
      "</div>" +
      '<h1 class="blog-single-title blog-post-h1">' +
      escapeHtml(post.title) +
      "</h1>" +
      '<div class="entry-content page-content">' +
      bodyHtml +
      "</div>" +
      '<p class="blog-back-link"><a href="blog.html">&larr; Back to Blog</a></p>' +
      "</article>";

    var list = document.getElementById("blog-recent-posts");
    if (list) {
      list.innerHTML = POSTS.filter(function (p) {
        return p.id !== id;
      })
        .slice(0, 3)
        .map(function (p) {
          var thumb = p.image
            ? '<div class="recent-post-thumbnail"><img src="' +
              p.image +
              '" alt="" width="70" height="70" loading="lazy"></div>'
            : "";
          return (
            "<li><a href=\"blog-post.html?id=" +
            encodeURIComponent(p.id) +
            '">' +
            thumb +
            '<div class="recent-post-title">' +
            escapeHtml(p.title) +
            "</div></a></li>"
          );
        })
        .join("");
    }
  });
})();

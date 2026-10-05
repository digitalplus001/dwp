(function () {
  "use strict";

  var POSTS = window.DWP_BLOG_POSTS || [];
  var PER_PAGE = 5;

  function getPage() {
    var params = new URLSearchParams(window.location.search);
    var p = parseInt(params.get("page") || "1", 10);
    return isNaN(p) || p < 1 ? 1 : p;
  }

  function renderPost(post) {
    var imageHtml = post.image
      ? '<div class="entry-image"><a href="blog-post.html?id=' +
        encodeURIComponent(post.id) +
        '"><img src="' +
        post.image +
        '" alt="' +
        escapeHtml(post.title) +
        '" width="800" height="418" loading="lazy"></a></div>'
      : "";

    return (
      '<article class="post">' +
      imageHtml +
      '<div class="entry-meta">' +
      '<span class="published"><i class="bi bi-clock" aria-hidden="true"></i><a href="blog-post.html?id=' +
      encodeURIComponent(post.id) +
      '">' +
      escapeHtml(post.date) +
      "</a></span>" +
      '<span class="author"><i class="bi bi-person" aria-hidden="true"></i><a href="about-us.html">Digital Wealth Partners</a></span>' +
      '<span class="blog-label"><i class="bi bi-folder" aria-hidden="true"></i><a href="blog.html?category=' +
      encodeURIComponent(post.category.toLowerCase()) +
      '">' +
      escapeHtml(post.category) +
      "</a></span>" +
      '<span class="comment-count"><i class="bi bi-chat" aria-hidden="true"></i><span>Comments Off</span></span>' +
      "</div>" +
      '<h2 class="blog-single-title"><a href="blog-post.html?id=' +
      encodeURIComponent(post.id) +
      '">' +
      escapeHtml(post.title) +
      "</a></h2>" +
      '<div class="entry-content">' +
      '<div class="page-content"><p>' +
      escapeHtml(post.excerpt) +
      "</p></div>" +
      '<a class="tt_button tt_primary_button btn_primary_color hover_solid_secondary post_button" href="blog-post.html?id=' +
      encodeURIComponent(post.id) +
      '"><span class="prim_text">Read more</span><i class="bi bi-chevron-right iconita" aria-hidden="true"></i></a>' +
      "</div></article>"
    );
  }

  function escapeHtml(str) {
    if (typeof DWP !== "undefined" && DWP.escapeHtml) {
      return DWP.escapeHtml(str);
    }
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function renderPagination(current, totalPages) {
    if (totalPages <= 1) return "";
    var html =
      '<nav class="blog-pagination" aria-label="Blog pagination"><ul class="blog-page-numbers">';
    for (var i = 1; i <= totalPages; i++) {
      var cls = i === current ? ' class="active"' : "";
      var href = i === 1 ? "blog.html" : "blog.html?page=" + i;
      html += "<li" + cls + '><a href="' + href + '">' + i + "</a></li>";
    }
    if (current < totalPages) {
      html +=
        '<li class="next-post-link"><a href="blog.html?page=' +
        (current + 1) +
        '">Next Page &raquo;</a></li>';
    }
    html += "</ul></nav>";
    return html;
  }

  function renderRecentPosts() {
    var list = document.getElementById("blog-recent-posts");
    if (!list) return;
    list.innerHTML = POSTS.slice(0, 3)
      .map(function (post) {
        var thumb = post.image
          ? '<div class="recent-post-thumbnail"><img src="' +
            post.image +
            '" alt="" width="70" height="70" loading="lazy"></div>'
          : "";
        return (
          "<li>" +
          '<a href="blog-post.html?id=' +
          encodeURIComponent(post.id) +
          '">' +
          thumb +
          '<div class="recent-post-title">' +
          escapeHtml(post.title) +
          "</div></a></li>"
        );
      })
      .join("");
  }

  function initListPage() {
    var container = document.getElementById("blog-posts-list");
    if (!container) return;

    var params = new URLSearchParams(window.location.search);
    var category = params.get("category");
    var filtered = category
      ? POSTS.filter(function (p) {
          return p.category.toLowerCase() === category.toLowerCase();
        })
      : POSTS.slice();

    var page = getPage();
    var totalPages = Math.max(1, Math.ceil(filtered.length / PER_PAGE));
    if (page > totalPages) page = totalPages;
    var start = (page - 1) * PER_PAGE;
    var slice = filtered.slice(start, start + PER_PAGE);

    container.innerHTML = slice.map(renderPost).join("");
    var pagEl = document.getElementById("blog-pagination-wrap");
    if (pagEl) {
      pagEl.innerHTML = renderPagination(page, totalPages);
    }
    renderRecentPosts();
  }

  function initSearch() {
    var form = document.getElementById("blog-search-form");
    if (!form) return;
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var q = (form.querySelector(".search-field") || {}).value || "";
      q = q.trim().toLowerCase();
      if (!q) return;
      var container = document.getElementById("blog-posts-list");
      if (!container) return;
      var matches = POSTS.filter(function (p) {
        return (
          p.title.toLowerCase().indexOf(q) >= 0 ||
          p.excerpt.toLowerCase().indexOf(q) >= 0 ||
          p.category.toLowerCase().indexOf(q) >= 0
        );
      });
      container.innerHTML = matches.length
        ? matches.map(renderPost).join("")
        : '<p class="blog-no-results">No posts found for your search.</p>';
      var pagEl = document.getElementById("blog-pagination-wrap");
      if (pagEl) pagEl.innerHTML = "";
    });
  }

  document.addEventListener("DOMContentLoaded", function () {
    initListPage();
    initSearch();
  });
})();

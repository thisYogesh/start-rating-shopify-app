(function () {
  "use strict";

  function initStarRatingForms() {
    var forms = document.querySelectorAll(".star-rating-form");

    forms.forEach(function (form) {
      if (form.dataset.initialized) return;
      form.dataset.initialized = "true";

      var starsContainer = form.querySelector(".star-rating-form__stars");
      var stars = starsContainer.querySelectorAll(".star--interactive");
      var ratingInput = form.querySelector('input[name="rating"]');
      var submitBtn = form.querySelector(".star-rating-form__submit");
      var messageEl = form.querySelector(".star-rating-message");
      var proxyUrl = form.dataset.proxyUrl || "/apps/star-rating";
      var selectedRating = 0;

      function updateStarDisplay(rating, isHover) {
        stars.forEach(function (star) {
          var value = parseInt(star.dataset.value, 10);
          star.classList.remove("star--hovered", "star--selected", "star--empty");
          if (isHover) {
            if (value <= rating) {
              star.classList.add("star--hovered");
            } else {
              star.classList.add("star--empty");
            }
          } else {
            if (value <= selectedRating) {
              star.classList.add("star--selected");
            } else {
              star.classList.add("star--empty");
            }
          }
        });
      }

      stars.forEach(function (star) {
        star.addEventListener("mouseenter", function () {
          var value = parseInt(this.dataset.value, 10);
          updateStarDisplay(value, true);
        });

        star.addEventListener("click", function () {
          selectedRating = parseInt(this.dataset.value, 10);
          ratingInput.value = selectedRating;
          submitBtn.disabled = false;
          updateStarDisplay(selectedRating, false);
        });

        star.addEventListener("keydown", function (e) {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            selectedRating = parseInt(this.dataset.value, 10);
            ratingInput.value = selectedRating;
            submitBtn.disabled = false;
            updateStarDisplay(selectedRating, false);
          }
        });
      });

      starsContainer.addEventListener("mouseleave", function () {
        updateStarDisplay(selectedRating, false);
      });

      submitBtn.addEventListener("click", function () {
        if (selectedRating === 0) return;

        var productId = form.querySelector('input[name="productId"]').value;
        var customerInput = form.querySelector('input[name="customerIdentifier"]');
        var customerIdentifier = customerInput ? customerInput.value : "";

        if (!customerIdentifier) {
          showMessage("Please enter your email address.", "error");
          return;
        }

        submitBtn.disabled = true;
        submitBtn.classList.add("star-rating-form__submit--loading");
        submitBtn.textContent = "Submitting...";
        showMessage("", "");

        var formData = new FormData();
        formData.append("productId", productId);
        formData.append("rating", String(selectedRating));
        formData.append("customerIdentifier", customerIdentifier);

        fetch(proxyUrl, {
          method: "POST",
          body: formData,
        })
          .then(function (response) {
            return response.json();
          })
          .then(function (data) {
            if (data.success) {
              showMessage(
                "Thank you! Your rating has been submitted. Average: " +
                  data.average +
                  " (" +
                  data.count +
                  " ratings)",
                "success"
              );

              // Update all display blocks for this product (PDP + product grid cards)
              updateDisplayBlocks(productId, data.average, data.count);
            } else {
              showMessage(data.error || "Failed to submit rating.", "error");
            }
          })
          .catch(function () {
            showMessage("Something went wrong. Please try again.", "error");
          })
          .finally(function () {
            submitBtn.disabled = false;
            submitBtn.classList.remove("star-rating-form__submit--loading");
            submitBtn.textContent =
              form.querySelector(".star-rating-form__submit").dataset
                .originalText || "Submit Rating";
          });
      });

      // Store original button text
      submitBtn.dataset.originalText = submitBtn.textContent;

      function showMessage(text, type) {
        messageEl.textContent = text;
        messageEl.className = "star-rating-message";
        if (type) {
          messageEl.classList.add("star-rating-message--" + type);
        }
      }
    });
  }

  function updateDisplayBlocks(productId, average, count) {
    // Find all display blocks matching this product ID (PDP block + any product grid cards)
    var selector = productId
      ? '.sr-display[data-product-id="' + productId + '"]'
      : ".sr-display";
    var displays = document.querySelectorAll(selector);
    displays.forEach(function (display) {
      // Update SVG gradient stops for each star
      var starSvgs = display.querySelectorAll(".sr-star");
      starSvgs.forEach(function (svg, index) {
        var i = index + 1;
        var fill = average - i + 1;
        var pct;
        if (fill >= 1) {
          pct = 100;
        } else if (fill > 0) {
          pct = Math.round(fill * 100);
        } else {
          pct = 0;
        }
        // Update both stops in the linearGradient
        var stops = svg.querySelectorAll("linearGradient stop");
        if (stops.length >= 2) {
          stops[0].setAttribute("offset", pct + "%");
          stops[1].setAttribute("offset", pct + "%");
        }
      });

      // Update the score text
      var scoreEl = display.querySelector(".sr-display__score");
      if (scoreEl) {
        scoreEl.textContent = average.toFixed(1);
      }

      // Update the count text
      var countEl = display.querySelector(".sr-display__count");
      if (countEl) {
        if (average > 0) {
          countEl.textContent = count + " " + (count === 1 ? "review" : "reviews");
          countEl.classList.remove("sr-display__count--empty");
        } else {
          countEl.textContent = "No reviews yet";
          countEl.classList.add("sr-display__count--empty");
        }
      }

      // If meta section was hidden because there were 0 ratings, show it now
      var metaEl = display.querySelector(".sr-display__meta");
      if (metaEl && average > 0) {
        // Ensure score and separator exist (they may have been absent in the "no reviews" state)
        if (!scoreEl) {
          var sep = display.querySelector(".sr-display__sep");
          if (!sep) {
            var newScore = document.createElement("span");
            newScore.className = "sr-display__score";
            newScore.textContent = average.toFixed(1);
            var newSep = document.createElement("span");
            newSep.className = "sr-display__sep";
            newSep.innerHTML = "&middot;";
            metaEl.prepend(newSep);
            metaEl.prepend(newScore);
          }
        }
      }

      // Update the aria-label on the container
      display.setAttribute(
        "aria-label",
        average.toFixed(1) + " out of 5 stars based on " + count + " " + (count === 1 ? "rating" : "ratings")
      );
    });
  }

  // Initialize on DOMContentLoaded and also handle dynamic loading
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initStarRatingForms);
  } else {
    initStarRatingForms();
  }
})();

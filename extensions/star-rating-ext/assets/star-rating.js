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

              // Update any display blocks on the same page
              updateDisplayBlocks(data.average, data.count);
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

  function updateDisplayBlocks(average, count) {
    var displays = document.querySelectorAll(".star-rating-display");
    displays.forEach(function (display) {
      var starsContainer = display.querySelector(".star-rating-display__stars");
      if (starsContainer) {
        var starEls = starsContainer.querySelectorAll(".star");
        starEls.forEach(function (star, index) {
          star.classList.remove("star--filled", "star--half", "star--empty");
          if (index + 1 <= Math.round(average)) {
            star.classList.add("star--filled");
          } else {
            star.classList.add("star--empty");
          }
        });
      }

      var countEl = display.querySelector(".star-rating-count");
      if (countEl) {
        countEl.textContent =
          average.toFixed(1) +
          " (" +
          count +
          " " +
          (count === 1 ? "rating" : "ratings") +
          ")";
      }
    });
  }

  // Initialize on DOMContentLoaded and also handle dynamic loading
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initStarRatingForms);
  } else {
    initStarRatingForms();
  }
})();

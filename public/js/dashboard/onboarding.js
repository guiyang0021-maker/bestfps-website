/**
 * Dashboard JS — 引导模块
 */
(function () {
  'use strict';

  var ONBOARDING_KEY = 'hasSeenOnboarding';
  var currentOnboardingStep = 0;
  var TOTAL_ONBOARDING_STEPS = 4;

  function showOnboardingModal() {
    currentOnboardingStep = 0;
    updateOnboardingUI();
    document.getElementById('onboarding-modal').classList.add('active');
  }

  function skipOnboarding() {
    localStorage.setItem(ONBOARDING_KEY, '1');
    document.getElementById('onboarding-modal').classList.remove('active');
  }

  function nextOnboardingStep() {
    if (currentOnboardingStep < TOTAL_ONBOARDING_STEPS - 1) {
      currentOnboardingStep++;
      updateOnboardingUI();
    } else {
      localStorage.setItem(ONBOARDING_KEY, '1');
      document.getElementById('onboarding-modal').classList.remove('active');
      window.toast('欢迎开始使用 bestfps！', 'success');
    }
  }

  function prevOnboardingStep() {
    if (currentOnboardingStep > 0) {
      currentOnboardingStep--;
      updateOnboardingUI();
    }
  }

  function updateOnboardingUI() {
    document.querySelectorAll('.onboarding-step-dot').forEach(function (dot, i) {
      dot.classList.toggle('active', i <= currentOnboardingStep);
      dot.classList.toggle('current', i === currentOnboardingStep);
    });
    document.querySelectorAll('.onboarding-step').forEach(function (step, i) {
      step.style.display = i === currentOnboardingStep ? 'block' : 'none';
    });
    var prevBtn = document.getElementById('onboarding-prev');
    var nextBtn = document.getElementById('onboarding-next');
    prevBtn.style.display = currentOnboardingStep > 0 ? 'inline-flex' : 'none';
    nextBtn.textContent = currentOnboardingStep === TOTAL_ONBOARDING_STEPS - 1 ? '开始使用' : '下一步';
  }

  window.showOnboardingModal = showOnboardingModal;
  window.skipOnboarding = skipOnboarding;
  window.nextOnboardingStep = nextOnboardingStep;
  window.prevOnboardingStep = prevOnboardingStep;
  window.updateOnboardingUI = updateOnboardingUI;
})();

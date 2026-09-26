export function renderPrivacy(container: HTMLElement) {
  container.innerHTML = `
    <div class="privacy-page">
      <div class="privacy-card">
        <h1 class="privacy-title">Privacy Notice</h1>
        <p class="privacy-last-updated">Fugleramme &mdash; a non-commercial personal project</p>

        <section class="privacy-section">
          <h2 class="privacy-heading">About this project</h2>
          <p class="privacy-body">Fugleramme is a non-commercial personal project. It is not operated as a commercial service and is not affiliated with any company.</p>
        </section>

        <section class="privacy-section">
          <h2 class="privacy-heading">Data we collect</h2>
          <ul class="privacy-list">
            <li><strong>Email address</strong> &mdash; required to create and identify your account. Used only for authentication.</li>
            <li><strong>Bird detection metadata</strong> &mdash; species name, confidence score, and timestamp of each detection. This is stored in your account to power the display.</li>
            <li><strong>Display preferences</strong> &mdash; settings you configure (display mode, margins, sort order).</li>
          </ul>
          <p class="privacy-body">We do not collect your real name, location, or any other personal information beyond the items above.</p>
        </section>

        <section class="privacy-section">
          <h2 class="privacy-heading">Microphone and audio</h2>
          <p class="privacy-body">Fugleramme uses your microphone to identify birds. Audio is captured by your browser, downsampled to 16&nbsp;kHz, and processed entirely on the device running the Fugleramme server.</p>
          <p class="privacy-body"><strong>Audio is never stored or transmitted beyond your local server.</strong> The processing pipeline holds at most 3&nbsp;seconds of audio in memory, runs inference, then immediately discards the audio. Only the resulting species name, confidence score, and timestamp are saved.</p>
        </section>

        <section class="privacy-section">
          <h2 class="privacy-heading">Where data is stored</h2>
          <p class="privacy-body">All data is stored in a SQLite database on the machine running the Fugleramme server. No data is sent to any external service, cloud provider, or third party.</p>
        </section>

        <section class="privacy-section">
          <h2 class="privacy-heading">Third-party sharing and analytics</h2>
          <p class="privacy-body">None. Fugleramme does not share data with third parties, does not use analytics services, and does not use cookies except for the session cookie required to keep you signed in.</p>
        </section>

        <section class="privacy-section">
          <h2 class="privacy-heading">Data retention</h2>
          <ul class="privacy-list">
            <li><strong>Detection history</strong> &mdash; retained until you delete your account.</li>
            <li><strong>Account data</strong> (email, settings) &mdash; retained until you delete your account.</li>
            <li><strong>Audio</strong> &mdash; never stored; discarded immediately after each detection.</li>
          </ul>
          <p class="privacy-body">Deleting your account permanently removes your email address, all detection history, and all settings.</p>
        </section>

        <section class="privacy-section">
          <h2 class="privacy-heading">Contact and source code</h2>
          <p class="privacy-body">Fugleramme is open source. You can inspect the code, report issues, or request data deletion via the project repository.</p>
        </section>

        <div class="privacy-back">
          <a class="privacy-back-link" href="#login">Back</a>
        </div>
      </div>
    </div>
  `;
}

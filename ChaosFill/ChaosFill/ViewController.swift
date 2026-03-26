//
//  ViewController.swift
//  ChaosFill
//
//  Created by Paweł Łuszyński on 06/03/2026.
//

import Cocoa
import os.log
import SafariServices
import WebKit

let extensionBundleIdentifier = "com.paweluszynski.ChaosFill.Extension"

class ViewController: NSViewController, WKNavigationDelegate, WKScriptMessageHandler {
    private let viewLog = OSLog(
        subsystem: Bundle.main.bundleIdentifier ?? "com.paweluszynski.ChaosFill",
        category: "ViewController"
    )
    // Debug-friendly default: keep host app alive so Xcode remains attached.
    private var shouldTerminateAfterOpeningPreferences: Bool {
#if DEBUG
        return false
#else
        // Future production toggle if needed.
        return false
#endif
    }

    @IBOutlet var webView: WKWebView!

    override func viewDidLoad() {
        super.viewDidLoad()
        os_log("CHAOSFILL_APP: ViewController.viewDidLoad", log: viewLog, type: .info)

        self.webView.navigationDelegate = self

        self.webView.configuration.userContentController.add(self, name: "controller")
        os_log("CHAOSFILL_APP: Registered WKScriptMessageHandler(name: controller)", log: viewLog, type: .info)

        guard let mainHtmlURL = Bundle.main.url(forResource: "Main", withExtension: "html"),
              let resourceURL = Bundle.main.resourceURL else {
            os_log("CHAOSFILL_APP: Failed to resolve host app HTML resources", log: viewLog, type: .error)
            return
        }

        os_log("CHAOSFILL_APP: Loading host app UI from %{public}@", log: viewLog, type: .info, mainHtmlURL.absoluteString)
        self.webView.loadFileURL(mainHtmlURL, allowingReadAccessTo: resourceURL)
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        os_log("CHAOSFILL_APP: WKWebView didFinish navigation, checking Safari extension state", log: viewLog, type: .info)
        SFSafariExtensionManager.getStateOfSafariExtension(withIdentifier: extensionBundleIdentifier) { (state, error) in
            guard let state = state, error == nil else {
                os_log("CHAOSFILL_APP: getStateOfSafariExtension failed: %{public}@", log: self.viewLog, type: .error, String(describing: error))
                return
            }

            DispatchQueue.main.async {
                if #available(macOS 13, *) {
                    os_log("CHAOSFILL_APP: Extension state resolved isEnabled=%{public}@, updating host UI via JS", log: self.viewLog, type: .info, String(state.isEnabled))
                    webView.evaluateJavaScript("show(\(state.isEnabled), true)") { _, jsError in
                        if let jsError = jsError {
                            os_log("CHAOSFILL_APP: evaluateJavaScript(show) failed: %{public}@", log: self.viewLog, type: .error, jsError.localizedDescription)
                        } else {
                            os_log("CHAOSFILL_APP: evaluateJavaScript(show) completed", log: self.viewLog, type: .info)
                        }
                    }
                } else {
                    os_log("CHAOSFILL_APP: Extension state resolved isEnabled=%{public}@, updating host UI via JS", log: self.viewLog, type: .info, String(state.isEnabled))
                    webView.evaluateJavaScript("show(\(state.isEnabled), false)") { _, jsError in
                        if let jsError = jsError {
                            os_log("CHAOSFILL_APP: evaluateJavaScript(show) failed: %{public}@", log: self.viewLog, type: .error, jsError.localizedDescription)
                        } else {
                            os_log("CHAOSFILL_APP: evaluateJavaScript(show) completed", log: self.viewLog, type: .info)
                        }
                    }
                }
            }
        }
    }

    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        os_log("CHAOSFILL_APP: Received WKScriptMessage name=%{public}@ body=%{public}@", log: viewLog, type: .info, message.name, String(describing: message.body))

        guard let body = message.body as? String else {
            os_log("CHAOSFILL_APP: Unexpected message body type from host UI", log: viewLog, type: .error)
            return
        }

        if (body != "open-preferences") {
            os_log("CHAOSFILL_APP: Ignoring message body=%{public}@", log: viewLog, type: .info, body)
            return;
        }

        os_log("CHAOSFILL_APP: user clicked open preferences", log: viewLog, type: .info)
        os_log("CHAOSFILL_APP: showPreferencesForExtension started", log: viewLog, type: .info)
        SFSafariApplication.showPreferencesForExtension(withIdentifier: extensionBundleIdentifier) { error in
            if let error = error {
                os_log("CHAOSFILL_APP: showPreferencesForExtension failed: %{public}@", log: self.viewLog, type: .error, error.localizedDescription)
            } else {
                os_log("CHAOSFILL_APP: showPreferencesForExtension completed successfully", log: self.viewLog, type: .info)
            }

            DispatchQueue.main.async {
                if self.shouldTerminateAfterOpeningPreferences {
                    os_log("CHAOSFILL_APP: terminating host app after preferences request (non-debug mode)", log: self.viewLog, type: .info)
                    NSApplication.shared.terminate(nil)
                } else {
                    os_log("CHAOSFILL_APP: app remains running for debugging after opening preferences", log: self.viewLog, type: .info)
                }
            }
        }
    }

}

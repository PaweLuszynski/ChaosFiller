//
//  SafariWebExtensionHandler.swift
//  ChaosFill Extension
//
//  Created by Paweł Łuszyński on 06/03/2026.
//

import SafariServices
import os.log

class SafariWebExtensionHandler: NSObject, NSExtensionRequestHandling {
    private let extensionLog = OSLog(
        subsystem: Bundle.main.bundleIdentifier ?? "com.paweluszynski.ChaosFill.Extension",
        category: "SafariWebExtensionHandler"
    )

    override init() {
        super.init()
        os_log("CHAOSFILL_EXTENSION: SafariWebExtensionHandler initialized", log: extensionLog, type: .info)
    }

    func beginRequest(with context: NSExtensionContext) {
        os_log("CHAOSFILL_EXTENSION: beginRequest invoked with %{public}d input item(s)", log: extensionLog, type: .info, context.inputItems.count)
        let request = context.inputItems.first as? NSExtensionItem

        let profile: UUID?
        if #available(iOS 17.0, macOS 14.0, *) {
            profile = request?.userInfo?[SFExtensionProfileKey] as? UUID
        } else {
            profile = request?.userInfo?["profile"] as? UUID
        }

        let message: Any?
        if #available(iOS 15.0, macOS 11.0, *) {
            message = request?.userInfo?[SFExtensionMessageKey]
        } else {
            message = request?.userInfo?["message"]
        }

        os_log(
            "CHAOSFILL_EXTENSION: Received native message=%{public}@ profile=%{public}@",
            log: extensionLog,
            type: .info,
            String(describing: message),
            profile?.uuidString ?? "none"
        )

        let response = NSExtensionItem()
        if #available(iOS 15.0, macOS 11.0, *) {
            response.userInfo = [ SFExtensionMessageKey: [ "echo": message ] ]
        } else {
            response.userInfo = [ "message": [ "echo": message ] ]
        }

        os_log("CHAOSFILL_EXTENSION: Completing request and returning echo response", log: extensionLog, type: .info)
        context.completeRequest(returningItems: [ response ], completionHandler: nil)
    }

}

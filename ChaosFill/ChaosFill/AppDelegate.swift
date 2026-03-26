//
//  AppDelegate.swift
//  ChaosFill
//
//  Created by Paweł Łuszyński on 06/03/2026.
//

import Cocoa
import os.log

@main
class AppDelegate: NSObject, NSApplicationDelegate {
    private let appLog = OSLog(
        subsystem: Bundle.main.bundleIdentifier ?? "com.paweluszynski.ChaosFill",
        category: "AppDelegate"
    )

    func applicationDidFinishLaunching(_ notification: Notification) {
        os_log("CHAOSFILL_APP: applicationDidFinishLaunching", log: appLog, type: .info)
    }

    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool {
        os_log("CHAOSFILL_APP: applicationShouldTerminateAfterLastWindowClosed -> true", log: appLog, type: .info)
        return true
    }

}

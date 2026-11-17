@objc(SuppressionDriveAuthorization)
public class SuppressionDriveAuthorization: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "SuppressionDriveAuthorization"
    public let jsName = "DriveAuthorization"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "authorize", returnType: CAPPluginReturnPromise)
    ]
    private let scope = "https://www.googleapis.com/auth/drive.appdata"

    @objc func authorize(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            let signIn = GIDSignIn.sharedInstance
            if let user = signIn.currentUser {
                self.authorize(user, call)
                return
            }
            signIn.restorePreviousSignIn { user, _ in
                if let user = user {
                    self.authorize(user, call)
                } else if call.getBool("interactive") == true, let controller = self.bridge?.viewController {
                    signIn.signIn(withPresenting: controller, hint: nil, additionalScopes: [self.scope]) { result, _ in
                        self.resolve(result?.user, call)
                    }
                } else {
                    call.reject("É preciso autorizar o Google Drive.", "CONSENT_REQUIRED")
                }
            }
        }
    }

    private func authorize(_ user: GIDGoogleUser, _ call: CAPPluginCall) {
        if user.grantedScopes?.contains(scope) == true {
            resolve(user, call)
        } else if call.getBool("interactive") == true, let controller = bridge?.viewController {
            user.addScopes([scope], presenting: controller) { result, _ in
                self.resolve(result?.user, call)
            }
        } else {
            call.reject("É preciso autorizar o Google Drive.", "CONSENT_REQUIRED")
        }
    }

    private func resolve(_ user: GIDGoogleUser?, _ call: CAPPluginCall) {
        guard let user = user, user.grantedScopes?.contains(scope) == true else {
            call.reject("A autorização não inclui acesso ao Drive.", "CONSENT_REQUIRED")
            return
        }
        user.refreshTokensIfNeeded { refreshed, _ in
            guard let token = refreshed?.accessToken.tokenString, !token.isEmpty else {
                call.reject("A sessão Google expirou.", "CONSENT_REQUIRED")
                return
            }
            call.resolve(["accessToken": token])
        }
    }
}

class SuppressionBridgeViewController: CAPBridgeViewController {
    override func capacitorDidLoad() {
        bridge?.registerPluginInstance(SuppressionDriveAuthorization())
    }
}

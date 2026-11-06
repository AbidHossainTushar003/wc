# Add project specific ProGuard rules here.
-keepattributes *Annotation*,Signature,InnerClasses,EnclosingMethod

# Keep Domain models and API payloads
-keep class store.wonderfulcollection.admin.domain.model.** { *; }
-keep class store.wonderfulcollection.admin.data.api.** { *; }

# Keep Tink / Security Crypto / JSON
-dontwarn javax.annotation.**
-dontwarn com.google.crypto.tink.**
-dontwarn org.json.**
-keep class org.json.** { *; }

package store.wonderfulcollection.admin.presentation.main

import android.content.Intent
import android.os.Bundle
import android.text.InputType
import android.view.ViewGroup
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.Toast
import androidx.appcompat.app.AlertDialog
import androidx.appcompat.app.AppCompatActivity
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch
import store.wonderfulcollection.admin.databinding.ActivityMainBinding
import store.wonderfulcollection.admin.di.ServiceLocator
import store.wonderfulcollection.admin.presentation.categories.CategoriesActivity
import store.wonderfulcollection.admin.presentation.coupons.CouponsActivity
import store.wonderfulcollection.admin.presentation.customers.CustomersActivity
import store.wonderfulcollection.admin.presentation.dashboard.DashboardActivity
import store.wonderfulcollection.admin.presentation.inventory.InventoryActivity
import store.wonderfulcollection.admin.presentation.orders.OrdersActivity
import store.wonderfulcollection.admin.presentation.products.ProductsActivity
import store.wonderfulcollection.admin.presentation.reports.ReportsActivity
import store.wonderfulcollection.admin.presentation.settings.SettingsActivity

/**
 * Main Hub Activity matching Image 2:
 * "ADMIN PANEL – BACKEND SCREENS / Only for you (the shop owner)"
 * Displays the 3x3 Grid of 9 rounded white cards.
 */
class MainActivity : AppCompatActivity() {

    private lateinit var binding: ActivityMainBinding
    private val activityScope = CoroutineScope(Dispatchers.Main)
    private var loginDialogShowing = false

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivityMainBinding.inflate(layoutInflater)
        setContentView(binding.root)

        setupGridClicks()
        setupTopBarActions()
        if (ServiceLocator.apiClient.adminToken == null) {
            promptAdminLogin()
        }
    }

    private fun promptAdminLogin() {
        if (loginDialogShowing || isFinishing) return
        loginDialogShowing = true
        val fields = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(48, 16, 48, 0)
        }
        val username = EditText(this).apply {
            hint = "Admin username"
            inputType = InputType.TYPE_CLASS_TEXT
            setText("admin")
        }
        val password = EditText(this).apply {
            hint = "Admin password"
            inputType = InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_VARIATION_PASSWORD
        }
        fields.addView(username, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT))
        fields.addView(password, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT))

        val dialog = AlertDialog.Builder(this)
            .setTitle("Admin sign in")
            .setView(fields)
            .setCancelable(false)
            .setNegativeButton("Exit") { _, _ -> finish() }
            .setPositiveButton("Sign in", null)
            .create()

        dialog.setOnDismissListener {
            loginDialogShowing = false
        }
        dialog.setOnShowListener {
            dialog.getButton(AlertDialog.BUTTON_POSITIVE).setOnClickListener {
                val enteredUsername = username.text.toString().trim()
                val enteredPassword = password.text.toString()
                if (enteredUsername.isEmpty() || enteredPassword.isEmpty()) {
                    Toast.makeText(this, "Enter your admin username and password.", Toast.LENGTH_SHORT).show()
                    return@setOnClickListener
                }

                val submit = dialog.getButton(AlertDialog.BUTTON_POSITIVE)
                submit.isEnabled = false
                activityScope.launch {
                    val result = ServiceLocator.apiClient.loginAdmin(enteredUsername, enteredPassword)
                    result.onSuccess {
                        dialog.dismiss()
                        Toast.makeText(this@MainActivity, "Admin sign in successful.", Toast.LENGTH_SHORT).show()
                    }.onFailure { error ->
                        submit.isEnabled = true
                        Toast.makeText(this@MainActivity, error.message ?: "Admin sign in failed.", Toast.LENGTH_LONG).show()
                    }
                }
            }
        }
        dialog.show()
    }

    override fun onResume() {
        super.onResume()
        if (::binding.isInitialized && ServiceLocator.apiClient.adminToken == null && !loginDialogShowing) {
            promptAdminLogin()
        }
    }

    private fun setupGridClicks() {
        // 1. Dashboard (Orange)
        binding.cardDashboard.setOnClickListener {
            startActivity(Intent(this, DashboardActivity::class.java))
        }

        // 2. Products (Blue)
        binding.cardProducts.setOnClickListener {
            startActivity(Intent(this, ProductsActivity::class.java))
        }

        // 3. Categories (Teal)
        binding.cardCategories.setOnClickListener {
            startActivity(Intent(this, CategoriesActivity::class.java))
        }

        // 4. Orders (Pink)
        binding.cardOrders.setOnClickListener {
            startActivity(Intent(this, OrdersActivity::class.java))
        }

        // 5. Customers (Purple)
        binding.cardCustomers.setOnClickListener {
            startActivity(Intent(this, CustomersActivity::class.java))
        }

        // 6. Coupons (Cyan)
        binding.cardCoupons.setOnClickListener {
            startActivity(Intent(this, CouponsActivity::class.java))
        }

        // 7. Stock / Inventory (Amber)
        binding.cardInventory.setOnClickListener {
            startActivity(Intent(this, InventoryActivity::class.java))
        }

        // 8. Reports (Red)
        binding.cardReports.setOnClickListener {
            startActivity(Intent(this, ReportsActivity::class.java))
        }

        // 9. Settings (Orange)
        binding.cardSettings.setOnClickListener {
            startActivity(Intent(this, SettingsActivity::class.java))
        }
    }

    private fun setupTopBarActions() {
        binding.btnBack.setOnClickListener {
            finish()
        }

        binding.btnAdd.setOnClickListener {
            Toast.makeText(this, "Quick Add Product", Toast.LENGTH_SHORT).show()
            startActivity(Intent(this, ProductsActivity::class.java))
        }
    }

    override fun onDestroy() {
        activityScope.cancel()
        super.onDestroy()
    }
}

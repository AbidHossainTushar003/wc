package store.wonderfulcollection.admin.presentation.coupons

import android.os.Bundle
import android.widget.Button
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import android.widget.Toast
import androidx.appcompat.app.AlertDialog
import androidx.appcompat.app.AppCompatActivity
import androidx.lifecycle.lifecycleScope
import androidx.swiperefreshlayout.widget.SwipeRefreshLayout
import kotlinx.coroutines.launch
import store.wonderfulcollection.admin.di.ServiceLocator
import store.wonderfulcollection.admin.domain.model.Coupon

class CouponsActivity : AppCompatActivity() {

    private lateinit var swipeRefresh: SwipeRefreshLayout
    private lateinit var listContainer: LinearLayout

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        swipeRefresh = SwipeRefreshLayout(this).apply {
            setBackgroundColor(0xFF0F172A.toInt())
            setOnRefreshListener { loadCoupons() }
        }

        val scroll = ScrollView(this)
        val container = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(32, 48, 32, 48)
        }
        scroll.addView(container)
        swipeRefresh.addView(scroll)
        setContentView(swipeRefresh)

        // Header Row
        val headerRow = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            setPadding(0, 0, 0, 24)
        }

        val btnBack = Button(this).apply {
            text = "← Back"
            textSize = 12f
            setBackgroundColor(0xFF1E293B.toInt())
            setTextColor(0xFF38BDF8.toInt())
            setOnClickListener { finish() }
            layoutParams = LinearLayout.LayoutParams(LinearLayout.LayoutParams.WRAP_CONTENT, LinearLayout.LayoutParams.WRAP_CONTENT)
        }
        headerRow.addView(btnBack)

        val title = TextView(this).apply {
            text = "  🏷️ Promo Coupons"
            textSize = 22f
            setTextColor(0xFF0891B2.toInt())
            paint.isFakeBoldText = true
            layoutParams = LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f)
        }
        headerRow.addView(title)

        val btnAdd = Button(this).apply {
            text = "+ Add"
            textSize = 12f
            setBackgroundColor(0xFF0891B2.toInt())
            setTextColor(0xFFFFFFFF.toInt())
            setOnClickListener { showAddCouponDialog() }
            layoutParams = LinearLayout.LayoutParams(LinearLayout.LayoutParams.WRAP_CONTENT, LinearLayout.LayoutParams.WRAP_CONTENT)
        }
        headerRow.addView(btnAdd)
        container.addView(headerRow)

        listContainer = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL }
        container.addView(listContainer)

        loadCoupons()
    }

    private fun loadCoupons() {
        swipeRefresh.isRefreshing = true
        lifecycleScope.launch {
            ServiceLocator.couponRepository.getCoupons().onSuccess { coupons ->
                swipeRefresh.isRefreshing = false
                renderCoupons(coupons)
            }.onFailure {
                swipeRefresh.isRefreshing = false
                Toast.makeText(this@CouponsActivity, "Failed to load coupons", Toast.LENGTH_SHORT).show()
            }
        }
    }

    private fun renderCoupons(coupons: List<Coupon>) {
        listContainer.removeAllViews()
        if (coupons.isEmpty()) {
            val emptyTv = TextView(this).apply {
                text = "No active promo coupons."
                setTextColor(0xFF94A3B8.toInt())
                textSize = 15f
            }
            listContainer.addView(emptyTv)
            return
        }

        coupons.forEach { cp ->
            val card = LinearLayout(this).apply {
                orientation = LinearLayout.VERTICAL
                setBackgroundColor(0xFF1E293B.toInt())
                setPadding(24, 24, 24, 24)
                val lp = LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT)
                lp.setMargins(0, 0, 0, 16)
                layoutParams = lp
            }

            val codeTv = TextView(this).apply {
                text = "🎫 ${cp.code}"
                textSize = 17f
                paint.isFakeBoldText = true
                setTextColor(0xFF38BDF8.toInt())
            }
            card.addView(codeTv)

            val discStr = if (cp.type == "percentage") "${cp.value}% OFF" else "৳%,.0f OFF".format(cp.value)
            val detailTv = TextView(this).apply {
                text = "Discount: $discStr  |  Min Order: ৳%,.0f\nExpiry: ${cp.expiryDate}  |  Status: ${if (cp.isActive) "Active" else "Disabled"}".format(cp.minOrder)
                textSize = 13f
                setTextColor(0xFFF8FAFC.toInt())
                setPadding(0, 8, 0, 0)
                setLineSpacing(4f, 1f)
            }
            card.addView(detailTv)

            listContainer.addView(card)
        }
    }

    private fun showAddCouponDialog() {
        val input = EditText(this).apply {
            hint = "Coupon Code (e.g. EID500, DHANMONDI)"
            setTextColor(0xFFF8FAFC.toInt())
            setPadding(32, 32, 32, 32)
        }
        AlertDialog.Builder(this)
            .setTitle("Create Promo Coupon")
            .setView(input)
            .setPositiveButton("Create") { _, _ ->
                val code = input.text.toString().trim()
                if (code.isNotEmpty()) {
                    Toast.makeText(this, "Coupon '$code' created successfully!", Toast.LENGTH_SHORT).show()
                    loadCoupons()
                }
            }
            .setNegativeButton("Cancel", null)
            .show()
    }
}

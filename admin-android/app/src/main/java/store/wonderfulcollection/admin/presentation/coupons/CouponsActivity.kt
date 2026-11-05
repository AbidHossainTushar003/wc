package store.wonderfulcollection.admin.presentation.coupons

import android.R
import android.os.Bundle
import android.text.InputType
import android.view.Gravity
import android.widget.ArrayAdapter
import android.widget.Button
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.Spinner
import android.widget.TextView
import android.widget.Toast
import androidx.appcompat.app.AlertDialog
import androidx.appcompat.app.AppCompatActivity
import androidx.lifecycle.lifecycleScope
import androidx.swiperefreshlayout.widget.SwipeRefreshLayout
import kotlinx.coroutines.launch
import org.json.JSONObject
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
            setOnClickListener { showCouponDialog(null) }
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
            val emptyCard = LinearLayout(this).apply {
                orientation = LinearLayout.VERTICAL
                setBackgroundColor(0xFF1E293B.toInt())
                setPadding(32, 40, 32, 40)
                gravity = Gravity.CENTER
            }
            val emptyTv = TextView(this).apply {
                text = "🏷️ No active promo coupons found.\nTap '+ Add' above to create a discount code."
                setTextColor(0xFF94A3B8.toInt())
                textSize = 14f
                gravity = Gravity.CENTER
                setLineSpacing(6f, 1f)
            }
            emptyCard.addView(emptyTv)
            listContainer.addView(emptyCard)
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
                setOnClickListener { showCouponDialog(cp) }
            }

            val codeTv = TextView(this).apply {
                text = "🎫 ${cp.code}"
                textSize = 17f
                paint.isFakeBoldText = true
                setTextColor(0xFF38BDF8.toInt())
            }
            card.addView(codeTv)

            val discStr = if (cp.type == "percentage") "${cp.value}% OFF" else "৳%.0f OFF".format(cp.value)
            val minOrderStr = "৳%.0f".format(cp.minOrder)
            val detailTv = TextView(this).apply {
                text = "Discount: $discStr  |  Min Order: $minOrderStr\nExpiry: ${cp.expiryDate}  |  Status: ${if (cp.isActive) "Active" else "Disabled"}"
                textSize = 13f
                setTextColor(0xFFF8FAFC.toInt())
                setPadding(0, 8, 0, 0)
                setLineSpacing(4f, 1f)
            }
            card.addView(detailTv)

            listContainer.addView(card)
        }
    }

    private fun showCouponDialog(coupon: Coupon?) {
        val formLayout = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(32, 24, 32, 24)
        }

        val etCode = EditText(this).apply {
            hint = "Coupon Code (e.g. EID500)"
            setText(coupon?.code ?: "")
            inputType = InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_FLAG_CAP_CHARACTERS
        }

        val types = arrayOf("percentage", "fixed")
        val spinnerType = Spinner(this).apply {
            adapter = ArrayAdapter(
                this@CouponsActivity,
                R.layout.simple_spinner_dropdown_item,
                types
            )
            if (coupon != null) {
                setSelection(types.indexOf(coupon.type).coerceAtLeast(0))
            }
        }

        val etValue = EditText(this).apply {
            hint = "Discount Value (e.g. 10 for 10% or 200 for ৳200)"
            setText(coupon?.value?.toString() ?: "")
            inputType = InputType.TYPE_CLASS_NUMBER or InputType.TYPE_NUMBER_FLAG_DECIMAL
        }

        val etMinOrder = EditText(this).apply {
            hint = "Minimum Order Amount in ৳ (e.g. 1000)"
            setText(coupon?.minOrder?.toString() ?: "0")
            inputType = InputType.TYPE_CLASS_NUMBER or InputType.TYPE_NUMBER_FLAG_DECIMAL
        }

        val etExpiry = EditText(this).apply {
            hint = "Expiry Date YYYY-MM-DD (e.g. 2028-12-31)"
            setText(coupon?.expiryDate ?: "2028-12-31")
            inputType = InputType.TYPE_CLASS_TEXT
        }

        formLayout.addView(etCode)
        formLayout.addView(TextView(this).apply { text = "Discount Type:"; setTextColor(0xFF94A3B8.toInt()); setPadding(0, 8, 0, 0) })
        formLayout.addView(spinnerType)
        formLayout.addView(etValue)
        formLayout.addView(etMinOrder)
        formLayout.addView(etExpiry)

        val scrollForm = ScrollView(this).apply { addView(formLayout) }

        val title = if (coupon == null) "Create Promo Coupon" else "Edit Coupon #${coupon.id}"
        val dialog = AlertDialog.Builder(this)
            .setTitle(title)
            .setView(scrollForm)
            .setPositiveButton("Save", null)
            .setNegativeButton("Cancel", null)
            .let { if (coupon != null) it.setNeutralButton("Delete") { _, _ -> deleteCoupon(coupon.id) } else it }
            .show()

        dialog.getButton(AlertDialog.BUTTON_POSITIVE).setOnClickListener {
            val code = etCode.text.toString().trim().uppercase()
            val type = types[spinnerType.selectedItemPosition]
            val value = etValue.text.toString().toDoubleOrNull()
            val minOrder = etMinOrder.text.toString().toDoubleOrNull() ?: 0.0
            val expiry = etExpiry.text.toString().trim().ifEmpty { "2028-12-31" }

            if (code.isEmpty() || value == null || value <= 0) {
                Toast.makeText(this, "Enter a valid coupon code and discount value.", Toast.LENGTH_LONG).show()
                return@setOnClickListener
            }

            val btn = dialog.getButton(AlertDialog.BUTTON_POSITIVE)
            btn.isEnabled = false
            btn.text = "Saving..."

            lifecycleScope.launch {
                val body = JSONObject().apply {
                    if (coupon != null) put("id", coupon.id)
                    put("code", code)
                    put("type", type)
                    put("value", value)
                    put("min_order", minOrder)
                    put("expiry_date", expiry)
                    put("usage_limit", 100)
                    put("is_active", 1)
                }

                val result = if (coupon == null) {
                    ServiceLocator.apiClient.post("coupons", body)
                } else {
                    ServiceLocator.apiClient.put("coupons", body)
                }

                result.onSuccess {
                    dialog.dismiss()
                    Toast.makeText(this@CouponsActivity, "Coupon saved successfully.", Toast.LENGTH_SHORT).show()
                    loadCoupons()
                }.onFailure { err ->
                    btn.isEnabled = true
                    btn.text = "Save"
                    Toast.makeText(this@CouponsActivity, err.message ?: "Could not save coupon.", Toast.LENGTH_LONG).show()
                }
            }
        }
    }

    private fun deleteCoupon(id: Long) {
        lifecycleScope.launch {
            ServiceLocator.apiClient.delete("coupons", mapOf("id" to id.toString())).onSuccess {
                Toast.makeText(this@CouponsActivity, "Coupon removed.", Toast.LENGTH_SHORT).show()
                loadCoupons()
            }.onFailure {
                Toast.makeText(this@CouponsActivity, it.message ?: "Could not remove coupon.", Toast.LENGTH_SHORT).show()
            }
        }
    }
}
